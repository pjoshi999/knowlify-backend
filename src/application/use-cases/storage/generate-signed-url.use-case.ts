import {
  StoragePort,
  GenerateSignedUrlInput,
} from "../../ports/storage.port.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type GenerateSignedUrlUseCase = (
  input: GenerateSignedUrlInput
) => Promise<string>;

export const createGenerateSignedUrlUseCase = (
  storage: StoragePort
): GenerateSignedUrlUseCase => {
  return async (input: GenerateSignedUrlInput): Promise<string> => {
    const { key } = input;

    // Check if file exists
    const exists = await storage.fileExists(key);

    if (!exists) {
      throw new NotFoundError(`File not found: ${key}`);
    }

    // Generate signed URL
    const signedUrl = await storage.generateSignedUrl(input);

    return signedUrl;
  };
};
