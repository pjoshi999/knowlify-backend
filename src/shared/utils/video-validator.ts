export interface VideoValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metadata?: {
    codec?: string;
    container?: string;
    duration?: number;
    bitrate?: number;
  };
}

export class VideoValidator {
  private static readonly ALLOWED_MIME_TYPES = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/x-matroska",
    "video/webm",
  ];

  // Reserved for future codec validation
  // private static readonly ALLOWED_CODECS = [
  //   "h264",
  //   "h265",
  //   "hevc",
  //   "vp8",
  //   "vp9",
  //   "av1",
  // ];

  private static readonly ALLOWED_CONTAINERS = [
    "mp4",
    "mov",
    "avi",
    "mkv",
    "webm",
  ];

  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
  private static readonly MIN_FILE_SIZE = 1024; // 1KB

  static validateMimeType(mimeType: string): VideoValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
      errors.push(
        `Unsupported MIME type: ${mimeType}. Allowed types: ${this.ALLOWED_MIME_TYPES.join(", ")}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateFileSize(fileSize: number): VideoValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (fileSize < this.MIN_FILE_SIZE) {
      errors.push(
        `File size too small: ${fileSize} bytes. Minimum: ${this.MIN_FILE_SIZE} bytes`
      );
    }

    if (fileSize > this.MAX_FILE_SIZE) {
      errors.push(
        `File size too large: ${fileSize} bytes. Maximum: ${this.MAX_FILE_SIZE} bytes`
      );
    }

    if (fileSize > 10 * 1024 * 1024 * 1024) {
      // 10GB
      warnings.push("Large file detected. Upload may take significant time.");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static validateFileName(fileName: string): VideoValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for valid characters
    const invalidChars = /[<>:"|?*\x00-\x1F]/;
    if (invalidChars.test(fileName)) {
      errors.push("File name contains invalid characters");
    }

    // Check file extension
    const extension = fileName.split(".").pop()?.toLowerCase();
    if (!extension || !this.ALLOWED_CONTAINERS.includes(extension)) {
      errors.push(
        `Invalid file extension: .${extension}. Allowed: ${this.ALLOWED_CONTAINERS.join(", ")}`
      );
    }

    // Check length
    if (fileName.length > 255) {
      errors.push("File name too long (max 255 characters)");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  static async validateFormat(
    fileName: string,
    mimeType: string,
    fileSize: number
  ): Promise<VideoValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate MIME type
    const mimeResult = this.validateMimeType(mimeType);
    errors.push(...mimeResult.errors);
    warnings.push(...mimeResult.warnings);

    // Validate file size
    const sizeResult = this.validateFileSize(fileSize);
    errors.push(...sizeResult.errors);
    warnings.push(...sizeResult.warnings);

    // Validate file name
    const nameResult = this.validateFileName(fileName);
    errors.push(...nameResult.errors);
    warnings.push(...nameResult.warnings);

    // Check MIME type matches file extension
    const extension = fileName.split(".").pop()?.toLowerCase();
    const expectedMimeType = this.getMimeTypeForExtension(extension || "");
    if (expectedMimeType && mimeType !== expectedMimeType) {
      warnings.push(
        `MIME type ${mimeType} doesn't match file extension .${extension}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private static getMimeTypeForExtension(extension: string): string | null {
    const mimeMap: Record<string, string> = {
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
    };

    return mimeMap[extension.toLowerCase()] || null;
  }
}
