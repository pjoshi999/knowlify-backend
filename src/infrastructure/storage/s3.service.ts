import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  StoragePort,
  UploadFileInput,
  UploadFileResult,
  GenerateSignedUrlInput,
} from "../../application/ports/storage.port.js";
import { config } from "../../shared/config.js";

export const createS3Service = (): StoragePort => {
  const s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
      accessKeyId: config.aws.accessKeyId,
      secretAccessKey: config.aws.secretAccessKey,
    },
  });

  const bucket = config.aws.s3BucketName;

  return {
    uploadFile: async (input: UploadFileInput): Promise<UploadFileResult> => {
      const { file, fileName, mimeType, folder } = input;

      // Generate unique key with timestamp
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const key = folder
        ? `${folder}/${timestamp}-${sanitizedFileName}`
        : `${timestamp}-${sanitizedFileName}`;

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file,
        ContentType: mimeType,
      });

      await s3Client.send(command);

      const url = `https://${bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;

      return {
        key,
        url,
        bucket,
      };
    },

    deleteFile: async (key: string): Promise<void> => {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await s3Client.send(command);
    },

    generateSignedUrl: async (
      input: GenerateSignedUrlInput
    ): Promise<string> => {
      const { key, expiresIn = 3600 } = input; // Default 1 hour

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      const signedUrl = await getSignedUrl(s3Client, command, {
        expiresIn,
      });

      return signedUrl;
    },

    fileExists: async (key: string): Promise<boolean> => {
      try {
        const command = new HeadObjectCommand({
          Bucket: bucket,
          Key: key,
        });

        await s3Client.send(command);
        return true;
      } catch (error) {
        return false;
      }
    },
  };
};
