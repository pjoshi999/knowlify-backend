export type Priority = "high" | "normal" | "low";
export type TranscodingStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";
export type VideoCodec = "h264" | "h265";

export interface QualityProfile {
  name: string; // '360p', '720p', '1080p', '4K'
  width: number;
  height: number;
  bitrate: number;
  codec: VideoCodec;
}

export interface TranscodingOutput {
  profile: string;
  key: string;
  duration: number;
  fileSize: number;
}

export interface TranscodingJob {
  jobId: string;
  sessionId: string;
  instructorId: string;
  courseId: string;
  sourceKey: string;
  priority: Priority;
  status: TranscodingStatus;
  profiles: QualityProfile[];
  outputs?: TranscodingOutput[];
  retryCount: number;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TranscodingResult {
  jobId: string;
  sessionId: string;
  outputs: TranscodingOutput[];
  thumbnails: string[];
  duration: number;
}

export interface TranscodingFailure {
  jobId: string;
  sessionId: string;
  error: string;
  retryCount: number;
}

export const QUALITY_PROFILES: Record<string, QualityProfile> = {
  "360p": {
    name: "360p",
    width: 640,
    height: 360,
    bitrate: 800000,
    codec: "h264",
  },
  "720p": {
    name: "720p",
    width: 1280,
    height: 720,
    bitrate: 2500000,
    codec: "h264",
  },
  "1080p": {
    name: "1080p",
    width: 1920,
    height: 1080,
    bitrate: 5000000,
    codec: "h264",
  },
  "4K": {
    name: "4K",
    width: 3840,
    height: 2160,
    bitrate: 20000000,
    codec: "h265",
  },
};
