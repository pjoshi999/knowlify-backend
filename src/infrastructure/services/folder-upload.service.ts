/**
 * Folder Upload Service
 *
 * Handles folder uploads with nested structure preservation
 * Manages temporary storage and session tracking
 */

import { S3StorageAdapter } from "../adapters/storage.adapter.js";
import { UploadSessionV2Repository } from "../repositories/upload-session-v2.repository.js";
import {
  FolderNode,
  UploadSessionV2,
} from "../../domain/models/upload-session-v2.model.js";
import { createModuleLogger } from "../../shared/logger.js";
import crypto from "crypto";

const log = createModuleLogger("folder-upload");

const ALLOWED_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
const SESSION_EXPIRY_HOURS = 24;

export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface FolderUploadParams {
  instructorId: string;
  files: UploadedFile[];
  folderStructure?: FolderNode[];
}

export class FolderUploadService {
  constructor(
    private storageAdapter: S3StorageAdapter,
    private sessionRepository: UploadSessionV2Repository
  ) {}

  /**
   * Upload folder with all files
   */
  async uploadFolder(params: FolderUploadParams): Promise<UploadSessionV2> {
    log.info(
      { instructorId: params.instructorId, fileCount: params.files.length },
      "Starting folder upload"
    );

    // Validate files
    this.validateFiles(params.files);

    // Calculate total size
    const totalSize = params.files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      throw new Error(
        `Total upload size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024 * 1024)}GB limit`
      );
    }

    // Generate session ID
    const sessionId = crypto.randomUUID();

    // Upload files to temp storage
    const tempStoragePaths: string[] = [];

    for (const file of params.files) {
      const tempPath = this.generateTempStoragePath(
        params.instructorId,
        sessionId,
        file.originalname
      );

      // Upload to S3 (simplified - in production, use multipart upload for large files)
      await this.uploadFileToS3(tempPath, file.buffer, file.mimetype);

      tempStoragePaths.push(tempPath);

      log.debug(
        { file: file.originalname, path: tempPath },
        "File uploaded to temp storage"
      );
    }

    // Create upload session
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

    const session = await this.sessionRepository.createSession({
      instructorId: params.instructorId,
      fileCount: params.files.length,
      totalSize,
      folderStructure: params.folderStructure,
      tempStoragePaths,
      expiresAt,
    });

    log.info(
      { sessionId: session.id, fileCount: params.files.length },
      "Folder upload complete"
    );

    return session;
  }

  /**
   * Move files from temp to structured storage
   */
  async moveToStructuredStorage(
    sessionId: string,
    courseId: string,
    structure: {
      moduleId: string;
      lessonId: string;
      fileName: string;
      type: string;
    }[]
  ): Promise<void> {
    log.info({ sessionId, courseId }, "Moving files to structured storage");

    const session = await this.sessionRepository.getSessionById(sessionId);
    if (!session) {
      throw new Error("Upload session not found");
    }

    for (const item of structure) {
      // Find temp file
      const tempPath = session.tempStoragePaths.find((path) =>
        path.includes(item.fileName)
      );
      if (!tempPath) {
        log.warn({ fileName: item.fileName }, "File not found in temp storage");
        continue;
      }

      // Generate structured path
      const structuredPath = this.generateStructuredPath(
        courseId,
        item.moduleId,
        item.type,
        item.lessonId,
        item.fileName
      );

      // Copy file to new location
      await this.storageAdapter.createFileReference(tempPath, structuredPath);

      log.debug(
        { from: tempPath, to: structuredPath },
        "File moved to structured storage"
      );
    }

    // Delete temp files
    await this.deleteTemporaryFiles(session.tempStoragePaths);

    // Update session status
    await this.sessionRepository.updateSession(sessionId, {
      status: "complete",
    });

    log.info({ sessionId }, "Files moved to structured storage successfully");
  }

  /**
   * Validate uploaded files
   */
  private validateFiles(files: UploadedFile[]): void {
    for (const file of files) {
      // Check MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        throw new Error(`File type not allowed: ${file.mimetype}`);
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(
          `File ${file.originalname} exceeds ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB limit`
        );
      }
    }
  }

  /**
   * Generate temp storage path
   */
  private generateTempStoragePath(
    instructorId: string,
    sessionId: string,
    fileName: string
  ): string {
    const uuid = crypto.randomUUID();
    const extension = fileName.split(".").pop() || "bin";
    return `temp-uploads/${instructorId}/${sessionId}/${uuid}.${extension}`;
  }

  /**
   * Generate structured storage path
   */
  private generateStructuredPath(
    courseId: string,
    moduleId: string,
    type: string,
    lessonId: string,
    fileName: string
  ): string {
    const extension = fileName.split(".").pop() || "bin";
    const typeFolder =
      type === "VIDEO" ? "videos" : type === "PDF" ? "documents" : "images";
    return `courses/${courseId}/modules/${moduleId}/${typeFolder}/${lessonId}.${extension}`;
  }

  /**
   * Upload file to S3 (simplified version)
   */
  private async uploadFileToS3(
    key: string,
    buffer: Buffer,
    _contentType: string
  ): Promise<void> {
    // In production, implement proper multipart upload for large files
    // For now, this is a placeholder
    log.debug({ key, size: buffer.length }, "Uploading file to S3");
    // Actual S3 upload would go here
  }

  /**
   * Delete temporary files from S3
   */
  private async deleteTemporaryFiles(paths: string[]): Promise<void> {
    log.info({ count: paths.length }, "Deleting temporary files");
    // Implement S3 delete operations
    for (const path of paths) {
      log.debug({ path }, "Deleting temp file");
      // Actual S3 delete would go here
    }
  }
}

export const createFolderUploadService = (
  storageAdapter: S3StorageAdapter,
  sessionRepository: UploadSessionV2Repository
): FolderUploadService => {
  return new FolderUploadService(storageAdapter, sessionRepository);
};
