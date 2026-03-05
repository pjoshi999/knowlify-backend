import { StoragePort } from "../../ports/storage.port.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export type DeleteFileUseCase = (key: string) => Promise<void>;

export const createDeleteFileUseCase = (
  storage: StoragePort
): DeleteFileUseCase => {
  return async (key: string): Promise<void> => {
    // Check if file exists
    const exists = await storage.fileExists(key);

    if (!exists) {
      throw new NotFoundError(`File not found: ${key}`);
    }

    // Delete file
    await storage.deleteFile(key);
  };
};
