import {
  StoragePort,
  UploadFileInput,
  UploadFileResult,
} from "../../ports/storage.port.js";
import { ValidationError } from "../../../domain/errors/domain.errors.js";

export type UploadFileUseCase = (
  input: UploadFileInput
) => Promise<UploadFileResult>;

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/ogg",
  "video/quicktime",
];
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_DOCUMENT_TYPES = ["application/pdf"];

export const createUploadFileUseCase = (
  storage: StoragePort
): UploadFileUseCase => {
  return async (input: UploadFileInput): Promise<UploadFileResult> => {
    const { file, fileName, mimeType } = input;

    // Validate file size
    if (file.length > MAX_FILE_SIZE) {
      throw new ValidationError(
        `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Validate file type
    const allowedTypes = [
      ...ALLOWED_VIDEO_TYPES,
      ...ALLOWED_IMAGE_TYPES,
      ...ALLOWED_DOCUMENT_TYPES,
    ];

    if (!allowedTypes.includes(mimeType)) {
      throw new ValidationError(
        `File type ${mimeType} is not allowed. Allowed types: ${allowedTypes.join(", ")}`
      );
    }

    // Validate file name
    if (!fileName || fileName.trim().length === 0) {
      throw new ValidationError("File name is required");
    }

    // Upload file
    const result = await storage.uploadFile(input);

    return result;
  };
};
