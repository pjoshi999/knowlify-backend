export interface UploadFileInput {
  file: Buffer;
  fileName: string;
  mimeType: string;
  folder?: string;
}

export interface UploadFileResult {
  key: string;
  url: string;
  bucket: string;
}

export interface GenerateSignedUrlInput {
  key: string;
  expiresIn?: number; // seconds
}

export interface StoragePort {
  uploadFile: (input: UploadFileInput) => Promise<UploadFileResult>;
  deleteFile: (key: string) => Promise<void>;
  generateSignedUrl: (input: GenerateSignedUrlInput) => Promise<string>;
  fileExists: (key: string) => Promise<boolean>;
}
