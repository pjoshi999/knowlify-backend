export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryAfter?: number;
    requestId: string;
  };
}

export class UploadError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "UploadError";
    Error.captureStackTrace(this, this.constructor);
  }
}

// Validation Errors (400)
export class ValidationError extends UploadError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, 400, details);
    this.name = "ValidationError";
  }
}

export class InvalidMimeTypeError extends UploadError {
  constructor(mimeType: string) {
    super(
      "INVALID_MIME_TYPE",
      `Invalid MIME type: ${mimeType}. Allowed types: video/mp4, video/quicktime, video/x-msvideo`,
      400,
      { mimeType }
    );
    this.name = "InvalidMimeTypeError";
  }
}

export class FileSizeLimitError extends UploadError {
  constructor(fileSize: number, maxSize: number = 53687091200) {
    super(
      "FILE_SIZE_LIMIT_EXCEEDED",
      `File size ${fileSize} bytes exceeds maximum allowed size of ${maxSize} bytes (50GB)`,
      400,
      { fileSize, maxSize }
    );
    this.name = "FileSizeLimitError";
  }
}

export class ChecksumMismatchError extends UploadError {
  constructor(expected: string, received: string) {
    super("CHECKSUM_MISMATCH", "Chunk integrity verification failed", 400, {
      expectedChecksum: expected,
      receivedChecksum: received,
    });
    this.name = "ChecksumMismatchError";
  }
}

// Authorization Errors (403)
export class CourseOwnershipError extends UploadError {
  constructor(instructorId: string, courseId: string) {
    super(
      "COURSE_OWNERSHIP_ERROR",
      "Instructor does not own the specified course",
      403,
      {
        instructorId,
        courseId,
      }
    );
    this.name = "CourseOwnershipError";
  }
}

// Rate Limit Errors (429)
export class RateLimitError extends UploadError {
  constructor(
    message: string,
    retryAfter: number,
    details?: Record<string, unknown>
  ) {
    super("RATE_LIMIT_EXCEEDED", message, 429, { ...details, retryAfter });
    this.name = "RateLimitError";
  }
}

export class ConcurrentUploadLimitError extends RateLimitError {
  constructor(
    currentUploads: number,
    maxAllowed: number,
    retryAfter: number = 60
  ) {
    super(`Maximum ${maxAllowed} concurrent uploads allowed`, retryAfter, {
      currentUploads,
      maxAllowed,
    });
    this.name = "ConcurrentUploadLimitError";
  }
}

export class DailyQuotaExceededError extends RateLimitError {
  constructor(quotaUsed: number, quotaLimit: number, retryAfter: number) {
    super(`Daily upload quota of ${quotaLimit} bytes exceeded`, retryAfter, {
      quotaUsed,
      quotaLimit,
    });
    this.name = "DailyQuotaExceededError";
  }
}

// Resource Errors (404)
export class SessionNotFoundError extends UploadError {
  constructor(sessionId: string) {
    super("SESSION_NOT_FOUND", `Upload session ${sessionId} not found`, 404, {
      sessionId,
    });
    this.name = "SessionNotFoundError";
  }
}

export class SessionExpiredError extends UploadError {
  constructor(sessionId: string, expiresAt: Date) {
    super("SESSION_EXPIRED", "Upload session has expired", 410, {
      sessionId,
      expiresAt: expiresAt.toISOString(),
      canRefresh: false,
    });
    this.name = "SessionExpiredError";
  }
}

// Conflict Errors (409)
export class InvalidStatusTransitionError extends UploadError {
  constructor(currentStatus: string, newStatus: string) {
    super(
      "INVALID_STATUS_TRANSITION",
      `Cannot transition from ${currentStatus} to ${newStatus}`,
      409,
      { currentStatus, newStatus }
    );
    this.name = "InvalidStatusTransitionError";
  }
}

export class ChunkAlreadyUploadedError extends UploadError {
  constructor(sessionId: string, chunkNumber: number) {
    super(
      "CHUNK_ALREADY_UPLOADED",
      `Chunk ${chunkNumber} already uploaded`,
      409,
      {
        sessionId,
        chunkNumber,
      }
    );
    this.name = "ChunkAlreadyUploadedError";
  }
}

// System Errors (500)
export class StorageProviderError extends UploadError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("STORAGE_PROVIDER_ERROR", message, 500, details);
    this.name = "StorageProviderError";
  }
}

export class DatabaseError extends UploadError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("DATABASE_ERROR", message, 500, details);
    this.name = "DatabaseError";
  }
}

export class MessageQueueError extends UploadError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("MESSAGE_QUEUE_ERROR", message, 500, details);
    this.name = "MessageQueueError";
  }
}

// Service Unavailable (503)
export class SystemCapacityExceededError extends UploadError {
  constructor(queuePosition: number, estimatedStartTime: Date) {
    super(
      "SYSTEM_CAPACITY_EXCEEDED",
      "System capacity exceeded, upload has been queued",
      503,
      {
        queuePosition,
        estimatedStartTime: estimatedStartTime.toISOString(),
      }
    );
    this.name = "SystemCapacityExceededError";
  }
}

export class EdgeLocationUnavailableError extends UploadError {
  constructor(region: string) {
    super(
      "EDGE_LOCATION_UNAVAILABLE",
      `Edge location in ${region} is unavailable`,
      503,
      {
        region,
      }
    );
    this.name = "EdgeLocationUnavailableError";
  }
}
