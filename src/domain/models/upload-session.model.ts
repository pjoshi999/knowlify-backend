export type SessionStatus =
  | "pending"
  | "uploading"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface UploadSession {
  sessionId: string;
  instructorId: string;
  courseId: string | null; // Allow null if video is uploaded before course is created
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum?: string;
  status: SessionStatus;
  storageKey: string;
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  version: number;
}

export interface CreateUploadSessionParams {
  instructorId: string;
  courseId: string | null; // Allow null if video is uploaded before course is created
  fileName: string;
  fileSize: number;
  mimeType: string;
  checksum?: string;
}

export interface UploadSessionFilters {
  status?: SessionStatus;
  createdAfter?: Date;
  createdBefore?: Date;
}

export function isValidSessionStatus(status: string): status is SessionStatus {
  return [
    "pending",
    "uploading",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ].includes(status);
}

export function canTransitionTo(
  currentStatus: SessionStatus,
  newStatus: SessionStatus
): boolean {
  const validTransitions: Record<SessionStatus, SessionStatus[]> = {
    pending: ["uploading", "cancelled"],
    uploading: ["processing", "failed", "cancelled"],
    processing: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
  };

  return validTransitions[currentStatus]?.includes(newStatus) ?? false;
}
