/**
 * Storage Path Utility
 *
 * Generates structured S3 paths for course assets
 */

export type AssetType =
  | "VIDEO"
  | "PDF"
  | "IMAGE"
  | "QUIZ"
  | "EXAM"
  | "NOTE"
  | "OTHER";

export interface StructuredPathParams {
  courseId: string;
  moduleId: string;
  assetType: AssetType;
  lessonId: string;
  fileName: string;
}

/**
 * Generate structured S3 path for course asset
 *
 * Format: courses/{courseId}/modules/{moduleId}/{typeFolder}/{lessonId}.{ext}
 *
 * Examples:
 * - courses/abc123/modules/mod456/videos/lesson789.mp4
 * - courses/abc123/modules/mod456/documents/lesson789.pdf
 * - courses/abc123/modules/mod456/images/lesson789.jpg
 */
export const generateStructuredPath = (
  params: StructuredPathParams
): string => {
  const { courseId, moduleId, assetType, lessonId, fileName } = params;

  // Extract file extension
  const extension = fileName.split(".").pop() || "bin";

  // Map asset type to folder name
  const typeFolder = getTypeFolderName(assetType);

  // Generate path
  return `courses/${courseId}/modules/${moduleId}/${typeFolder}/${lessonId}.${extension}`;
};

/**
 * Map asset type to folder name
 */
const getTypeFolderName = (assetType: AssetType): string => {
  switch (assetType) {
    case "VIDEO":
      return "videos";
    case "PDF":
      return "documents";
    case "IMAGE":
      return "images";
    case "QUIZ":
      return "quizzes";
    case "EXAM":
      return "exams";
    case "NOTE":
      return "notes";
    case "OTHER":
    default:
      return "other";
  }
};

/**
 * Parse structured path to extract components
 */
export const parseStructuredPath = (
  path: string
): {
  courseId: string;
  moduleId: string;
  typeFolder: string;
  fileName: string;
} | null => {
  // Expected format: courses/{courseId}/modules/{moduleId}/{typeFolder}/{fileName}
  const regex = /^courses\/([^/]+)\/modules\/([^/]+)\/([^/]+)\/([^/]+)$/;
  const match = path.match(regex);

  if (!match) {
    return null;
  }

  return {
    courseId: match[1]!,
    moduleId: match[2]!,
    typeFolder: match[3]!,
    fileName: match[4]!,
  };
};

/**
 * Validate structured path format
 */
export const isValidStructuredPath = (path: string): boolean => {
  return parseStructuredPath(path) !== null;
};

/**
 * Generate temp storage path for uploads
 */
export const generateTempStoragePath = (
  instructorId: string,
  sessionId: string,
  fileName: string
): string => {
  const extension = fileName.split(".").pop() || "bin";
  const timestamp = Date.now();
  return `temp-uploads/${instructorId}/${sessionId}/${timestamp}.${extension}`;
};
