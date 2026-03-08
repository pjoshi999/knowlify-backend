import { z } from "zod";

// Request Schemas
export const initiateUploadSchema = z.object({
  // instructorId is extracted from authenticated user (req.user.id), not from request body
  courseId: z.string().uuid().optional(), // Optional - can be associated with course later
  fileName: z.string().min(1).max(1024),
  fileSize: z.number().int().positive().max(53687091200), // 50GB max
  mimeType: z.enum(["video/mp4", "video/quicktime", "video/x-msvideo"]),
  checksum: z.string().length(64).optional(), // SHA-256 hash
});

export const chunkCompletionSchema = z.object({
  etag: z.string().min(1),
  checksum: z.string().length(64),
});

export const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

export const chunkNumberSchema = z.object({
  chunkNumber: z.number().int().positive(),
});

export const listUploadsSchema = z.object({
  // instructorId is extracted from authenticated user (req.user.id), not from query params
  status: z
    .enum([
      "pending",
      "uploading",
      "processing",
      "completed",
      "failed",
      "cancelled",
    ])
    .optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
});

// Response Schemas
export const uploadSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  uploadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  chunkSize: z.number().int().positive(),
  totalChunks: z.number().int().positive(),
  uploadId: z.string(),
});

export const progressResponseSchema = z.object({
  sessionId: z.string().uuid(),
  status: z.enum([
    "pending",
    "uploading",
    "processing",
    "completed",
    "failed",
    "cancelled",
  ]),
  percentComplete: z.number().min(0).max(100),
  bytesUploaded: z.number().int().nonnegative(),
  bytesRemaining: z.number().int().nonnegative(),
  uploadSpeedBytesPerSec: z.number().nonnegative(),
  estimatedTimeRemainingSec: z.number().nonnegative(),
  chunksCompleted: z.number().int().nonnegative(),
  totalChunks: z.number().int().positive(),
  queuePosition: z.number().int().positive().optional(),
  estimatedStartTime: z.string().datetime().optional(),
});

export const chunkAcknowledgmentSchema = z.object({
  acknowledged: z.boolean(),
  progress: progressResponseSchema,
});

// Type exports
export type InitiateUploadRequest = z.infer<typeof initiateUploadSchema>;
export type ChunkCompletionRequest = z.infer<typeof chunkCompletionSchema>;
export type ListUploadsRequest = z.infer<typeof listUploadsSchema>;
export type UploadSessionResponse = z.infer<typeof uploadSessionResponseSchema>;
export type ProgressResponse = z.infer<typeof progressResponseSchema>;
export type ChunkAcknowledgmentResponse = z.infer<
  typeof chunkAcknowledgmentSchema
>;
