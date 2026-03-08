export interface UploadChunk {
  id: number;
  sessionId: string;
  chunkNumber: number;
  etag: string;
  checksum: string;
  uploadedAt: Date;
}

export interface ChunkCompletionParams {
  sessionId: string;
  chunkNumber: number;
  etag: string;
  checksum: string;
}

export interface MultipartUploadInfo {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

export interface ProgressInfo {
  percentComplete: number;
  bytesUploaded: number;
  bytesRemaining: number;
  uploadSpeedBytesPerSec: number;
  estimatedTimeRemainingSec: number;
  chunksCompleted: number;
  totalChunks: number;
}
