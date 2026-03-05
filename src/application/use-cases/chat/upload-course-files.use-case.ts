import AdmZip from "adm-zip";
import type { ChatRepository } from "../../ports/chat.repository.port.js";
import type { StoragePort } from "../../ports/storage.port.js";
import type { QueuePort } from "../../ports/queue.port.js";
import { NotFoundError } from "../../../domain/errors/domain.errors.js";

export interface UploadCourseFilesInput {
  sessionId: string;
  userId: string;
  zipFile: Buffer;
  fileName: string;
}

export interface UploadCourseFilesResult {
  jobId: string;
  message: string;
}

export const uploadCourseFilesUseCase = (deps: {
  chatRepository: ChatRepository;
  storageService: StoragePort;
  queueService: QueuePort;
}) => {
  return async (
    input: UploadCourseFilesInput
  ): Promise<UploadCourseFilesResult> => {
    // Verify session
    const session = await deps.chatRepository.getSessionById(input.sessionId);
    if (!session || session.userId !== input.userId) {
      throw new NotFoundError("Chat session not found");
    }

    // Extract and analyze ZIP file
    const zip = new AdmZip(input.zipFile);
    const zipEntries = zip.getEntries();

    const fileList = zipEntries
      .filter((entry) => !entry.isDirectory)
      .map((entry) => ({
        path: entry.entryName,
        size: entry.header.size,
      }));

    // Upload ZIP to S3
    const uploadResult = await deps.storageService.uploadFile({
      file: input.zipFile,
      fileName: `${Date.now()}-${input.fileName}`,
      mimeType: "application/zip",
      folder: "course-uploads",
    });

    // Queue processing job
    const jobId = await deps.queueService.addJob(
      "course-processing",
      "parse-course-content",
      {
        sessionId: input.sessionId,
        userId: input.userId,
        zipKey: uploadResult.key,
        fileCount: fileList.length,
      },
      {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      }
    );

    // Save upload info to session
    await deps.chatRepository.updateSession(input.sessionId, {
      metadata: {
        uploadedAt: new Date().toISOString(),
        zipKey: uploadResult.key,
        fileCount: fileList.length,
        processingJobId: jobId,
      },
    });

    // Create assistant message
    await deps.chatRepository.createMessage({
      sessionId: input.sessionId,
      role: "assistant",
      content: `Great! I've received your course folder with ${fileList.length} files. I'm now processing the content. This may take a few minutes. I'll let you know when it's ready.`,
    });

    return {
      jobId,
      message: `Processing ${fileList.length} files`,
    };
  };
};
