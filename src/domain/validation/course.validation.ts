import { CourseStatus } from "../types/course.types.js";

export const validateCourseName = (name: string): string | null => {
  if (!name || name.trim().length === 0) {
    return "Course name is required";
  }
  if (name.length < 3) {
    return "Course name must be at least 3 characters";
  }
  if (name.length > 500) {
    return "Course name must not exceed 500 characters";
  }
  return null;
};

export const validateCourseDescription = (
  description: string
): string | null => {
  if (!description || description.trim().length === 0) {
    return "Course description is required";
  }
  if (description.length < 10) {
    return "Course description must be at least 10 characters";
  }
  if (description.length > 5000) {
    return "Course description must not exceed 5000 characters";
  }
  return null;
};

export const validateCategory = (category: string): string | null => {
  if (!category || category.trim().length === 0) {
    return "Category is required";
  }
  if (category.length > 100) {
    return "Category must not exceed 100 characters";
  }
  return null;
};

export const validatePrice = (price: number): string | null => {
  if (price < 0) {
    return "Price cannot be negative";
  }
  if (price > 999999) {
    return "Price is too high";
  }
  if (!Number.isInteger(price)) {
    return "Price must be an integer (in cents)";
  }
  return null;
};

export const validateCourseStatus = (status: string): string | null => {
  const validStatuses: CourseStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];
  if (!validStatuses.includes(status as CourseStatus)) {
    return `Status must be one of: ${validStatuses.join(", ")}`;
  }
  return null;
};

export const validateUrlSlug = (slug: string): string | null => {
  if (!slug || slug.trim().length === 0) {
    return "URL slug is required";
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "URL slug must contain only lowercase letters, numbers, and hyphens";
  }
  if (slug.length < 3) {
    return "URL slug must be at least 3 characters";
  }
  if (slug.length > 255) {
    return "URL slug must not exceed 255 characters";
  }
  return null;
};

export const validateRating = (rating: number): string | null => {
  if (!Number.isInteger(rating)) {
    return "Rating must be an integer";
  }
  if (rating < 1 || rating > 5) {
    return "Rating must be between 1 and 5";
  }
  return null;
};

export const validateReviewComment = (comment?: string): string | null => {
  if (comment && comment.length > 1000) {
    return "Review comment must not exceed 1000 characters";
  }
  return null;
};
