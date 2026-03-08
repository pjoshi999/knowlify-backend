/**
 * Upload Session V2 Domain Model
 *
 * Represents a temporary upload session for folder/video uploads
 */

export type UploadSessionStatus =
  | "uploading"
  | "analyzing"
  | "complete"
  | "failed";

export interface FolderNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FolderNode[];
  fileType?: string;
  size?: number;
}

export interface SuggestedModule {
  title: string;
  description: string;
  order: number;
  lessons: SuggestedLesson[];
}

export interface SuggestedLesson {
  title: string;
  type: string;
  fileName: string;
  order: number;
}

export interface SuggestedStructure {
  modules: SuggestedModule[];
  metadata: {
    suggestedName: string;
    suggestedDescription: string;
    suggestedCategory: string;
  };
}

export interface UploadSessionV2 {
  id: string;
  instructorId: string;
  status: UploadSessionStatus;
  fileCount: number;
  totalSize: number;
  folderStructure?: FolderNode[];
  tempStoragePaths: string[];
  suggestedStructure?: SuggestedStructure;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadSessionInput {
  instructorId: string;
  fileCount: number;
  totalSize: number;
  folderStructure?: FolderNode[];
  tempStoragePaths: string[];
  expiresAt: Date;
}

export interface UpdateUploadSessionInput {
  status?: UploadSessionStatus;
  fileCount?: number;
  totalSize?: number;
  tempStoragePaths?: string[];
  suggestedStructure?: SuggestedStructure;
}
