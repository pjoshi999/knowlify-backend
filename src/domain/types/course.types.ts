export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type AssetType = "VIDEO" | "PDF" | "QUIZ" | "EXAM" | "NOTE" | "OTHER";

export interface Course {
  id: string;
  instructorId: string;
  instructorName?: string;
  name: string;
  description: string;
  category: string;
  thumbnailUrl?: string;
  status: CourseStatus;
  priceAmount: number;
  priceCurrency: string;
  manifest: CourseManifest;
  urlSlug: string;
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  deletedAt?: Date;
}

export interface CourseManifest {
  modules: CourseModule[];
  totalDuration?: number;
  totalAssets?: number;
  metadata?: Record<string, unknown>;
}

export interface CourseModule {
  id: string;
  title: string;
  description?: string;
  order: number;
  lessons: CourseLesson[];
}

export interface CourseLesson {
  id: string;
  title: string;
  description?: string;
  order: number;
  assetId?: string;
  duration?: number;
  type: AssetType;
}

export interface CourseAsset {
  id: string;
  courseId: string;
  assetType: AssetType;
  fileName: string;
  fileSize: number;
  storagePath: string;
  mimeType: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateCourseInput {
  instructorId: string;
  name: string;
  description: string;
  category: string;
  thumbnailUrl?: string;
  priceAmount: number;
  priceCurrency?: string;
  manifest?: CourseManifest;
}

export interface UpdateCourseInput {
  name?: string;
  description?: string;
  category?: string;
  thumbnailUrl?: string;
  priceAmount?: number;
  manifest?: CourseManifest;
}

export interface CourseWithStats extends Course {
  enrollmentCount: number;
  avgRating: number;
  reviewCount: number;
  totalRevenue: number;
}

export interface CourseListFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  status?: CourseStatus;
  instructorId?: string;
  search?: string;
}

export interface CoursePaginationParams {
  page: number;
  limit: number;
  sortBy?: "createdAt" | "priceAmount" | "enrollmentCount" | "avgRating";
  sortOrder?: "asc" | "desc";
}
