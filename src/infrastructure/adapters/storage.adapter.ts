import {
  S3Client,
  CreateMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  UploadPartCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { logger } from "@shared/logger.js";
import { StorageProviderError } from "@shared/errors/upload-errors.js";

export interface PresignedUrlParams {
  key: string;
  uploadId: string;
  partNumber: number;
  expiresIn: number;
  edgeAcceleration: boolean;
}

export interface PresignedUrlResult {
  url: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface InitiateMultipartParams {
  key: string;
  contentType: string;
  metadata: Record<string, string>;
}

export interface CompleteMultipartParams {
  uploadId: string;
  key: string;
  parts: Array<{ partNumber: number; etag: string }>;
}

export interface StorageAdapter {
  generatePresignedUrl(params: PresignedUrlParams): Promise<PresignedUrlResult>;
  initiateMultipartUpload(params: InitiateMultipartParams): Promise<string>;
  completeMultipartUpload(params: CompleteMultipartParams): Promise<void>;
  abortMultipartUpload(uploadId: string, key: string): Promise<void>;
  calculateFileHash(key: string): Promise<string>;
  fileExists(hash: string): Promise<boolean>;
  createFileReference(sourceKey: string, targetKey: string): Promise<void>;
}

export class S3StorageAdapter implements StorageAdapter {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private enableTransferAcceleration: boolean;

  constructor(config: {
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    enableTransferAcceleration?: boolean;
  }) {
    this.region = config.region;
    this.bucket = config.bucket;
    this.enableTransferAcceleration = config.enableTransferAcceleration ?? true;

    this.client = new S3Client({
      region: config.region,
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });

    logger.info({
      message: "S3StorageAdapter initialized",
      region: this.region,
      bucket: this.bucket,
      transferAcceleration: this.enableTransferAcceleration,
    });
  }

  async generatePresignedUrl(
    params: PresignedUrlParams
  ): Promise<PresignedUrlResult> {
    try {
      const command = new UploadPartCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        PartNumber: params.partNumber,
      });

      let url = await getSignedUrl(this.client, command, {
        expiresIn: params.expiresIn,
      });

      // Apply edge acceleration if enabled
      if (params.edgeAcceleration && this.enableTransferAcceleration) {
        url = this.applyEdgeAcceleration(url);
      }

      const expiresAt = new Date(Date.now() + params.expiresIn * 1000);

      logger.debug({
        message: "Generated pre-signed URL",
        key: params.key,
        partNumber: params.partNumber,
        expiresAt,
        edgeAcceleration: params.edgeAcceleration,
      });

      return {
        url,
        expiresAt,
        headers: {},
      };
    } catch (error) {
      logger.error({
        message: "Failed to generate pre-signed URL",
        error,
        params,
      });
      throw new StorageProviderError("Failed to generate pre-signed URL", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async initiateMultipartUpload(
    params: InitiateMultipartParams
  ): Promise<string> {
    try {
      const command = new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        ContentType: params.contentType,
        Metadata: params.metadata,
        ServerSideEncryption: "AES256",
      });

      const response = await this.executeWithRetry(() =>
        this.client.send(command)
      );

      if (!response.UploadId) {
        throw new StorageProviderError("No upload ID returned from S3");
      }

      logger.info({
        message: "Initiated multipart upload",
        key: params.key,
        uploadId: response.UploadId,
      });

      return response.UploadId;
    } catch (error) {
      logger.error({
        message: "Failed to initiate multipart upload",
        error,
        params,
      });
      throw new StorageProviderError("Failed to initiate multipart upload", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async completeMultipartUpload(
    params: CompleteMultipartParams
  ): Promise<void> {
    try {
      // Normalize ETags - ensure they have quotes as S3 expects
      const normalizedParts = params.parts.map((part) => {
        let etag = part.etag.trim();
        // Remove existing quotes if present
        if (etag.startsWith('"') && etag.endsWith('"')) {
          etag = etag.slice(1, -1);
        }
        // Add quotes back - S3 expects ETags with quotes
        return {
          partNumber: part.partNumber,
          etag: `"${etag}"`,
        };
      });

      logger.info({
        message: "Attempting to complete multipart upload",
        key: params.key,
        uploadId: params.uploadId,
        totalParts: normalizedParts.length,
        parts: normalizedParts.map((p) => ({
          partNumber: p.partNumber,
          etagLength: p.etag.length,
          etagSample: p.etag.substring(0, 20),
          hasQuotes: p.etag.startsWith('"') && p.etag.endsWith('"'),
        })),
      });

      const command = new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: params.key,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: normalizedParts.map((part) => ({
            PartNumber: part.partNumber,
            ETag: part.etag,
          })),
        },
      });

      const result = await this.executeWithRetry(() =>
        this.client.send(command)
      );

      logger.info({
        message: "Completed multipart upload successfully",
        key: params.key,
        uploadId: params.uploadId,
        totalParts: normalizedParts.length,
        location: result.Location,
        etag: result.ETag,
      });
    } catch (error: any) {
      logger.error({
        message: "Failed to complete multipart upload",
        error: {
          name: error?.name,
          message: error?.message,
          code: error?.Code || error?.code,
          statusCode: error?.$metadata?.httpStatusCode,
          requestId: error?.$metadata?.requestId,
        },
        params: {
          key: params.key,
          uploadId: params.uploadId,
          totalParts: params.parts.length,
          parts: params.parts,
        },
      });
      throw new StorageProviderError("Failed to complete multipart upload", {
        originalError: error instanceof Error ? error.message : String(error),
        awsError: error?.Code || error?.code,
        statusCode: error?.$metadata?.httpStatusCode,
      });
    }
  }

  async abortMultipartUpload(uploadId: string, key: string): Promise<void> {
    try {
      const command = new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
      });

      await this.executeWithRetry(() => this.client.send(command));

      logger.info({ message: "Aborted multipart upload", key, uploadId });
    } catch (error) {
      logger.error({
        message: "Failed to abort multipart upload",
        error,
        uploadId,
        key,
      });
      throw new StorageProviderError("Failed to abort multipart upload", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async calculateFileHash(key: string): Promise<string> {
    try {
      // For S3, we can use the ETag as a hash proxy for deduplication
      // Note: For multipart uploads, ETag is not MD5, so we use it as-is
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.executeWithRetry(() =>
        this.client.send(command)
      );

      if (!response.ETag) {
        throw new StorageProviderError("No ETag returned from S3");
      }

      // Remove quotes from ETag and use as hash
      const fileHash = response.ETag.replace(/"/g, "");

      logger.debug({ message: "Calculated file hash", key, hash: fileHash });

      return fileHash;
    } catch (error) {
      logger.error({ message: "Failed to calculate file hash", error, key });
      throw new StorageProviderError("Failed to calculate file hash", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async fileExists(_hash: string): Promise<boolean> {
    // This would be checked against the file_hashes table in the database
    // Not implemented here as it's a database operation
    return false;
  }

  async createFileReference(
    sourceKey: string,
    targetKey: string
  ): Promise<void> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: targetKey,
        MetadataDirective: "COPY",
      });

      await this.executeWithRetry(() => this.client.send(command));

      logger.info({ message: "Created file reference", sourceKey, targetKey });
    } catch (error) {
      logger.error({
        message: "Failed to create file reference",
        error,
        sourceKey,
        targetKey,
      });
      throw new StorageProviderError("Failed to create file reference", {
        originalError: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private applyEdgeAcceleration(url: string): string {
    try {
      // Replace standard S3 endpoint with accelerated endpoint
      // Example: bucket.s3.region.amazonaws.com -> bucket.s3-accelerate.amazonaws.com
      const acceleratedUrl = url.replace(
        /\.s3\.([a-z0-9-]+)\.amazonaws\.com/,
        ".s3-accelerate.amazonaws.com"
      );

      return acceleratedUrl;
    } catch (error) {
      logger.warn({
        message: "Failed to apply edge acceleration, using standard URL",
        error,
      });
      return url;
    }
  }

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;

        logger.warn({
          message: `Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`,
          error: lastError.message,
        });

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }
}

// Utility function to generate storage key
export function generateStorageKey(
  instructorId: string,
  courseId: string | null,
  fileName: string
): string {
  const uuid = crypto.randomUUID();
  const extension = fileName.split(".").pop() || "mp4";

  // New structured path: courses/{courseId}/modules/{moduleId}/videos/{uuid}.{ext}
  // For now, use a default module until we implement module management
  if (courseId) {
    return `courses/${courseId}/modules/default/videos/${uuid}.${extension}`;
  }

  // Temporary storage for uploads before course is created
  return `temp-uploads/${instructorId}/${uuid}.${extension}`;
}

// Utility function to calculate chunk size and count
export function calculateChunkInfo(fileSize: number): {
  chunkSize: number;
  totalChunks: number;
} {
  const CHUNK_SIZE = 100 * 1024 * 1024; // 100MB
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

  return {
    chunkSize: CHUNK_SIZE,
    totalChunks,
  };
}
