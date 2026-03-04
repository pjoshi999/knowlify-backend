import { Course, CourseStatus } from "../types/course.types.js";
import { DomainError } from "../errors/domain.errors.js";

export const canPublishCourse = (course: Course): boolean => {
  if (course.status === "PUBLISHED") {
    return false;
  }
  if (!course.name || !course.description) {
    return false;
  }
  if (course.priceAmount < 0) {
    return false;
  }
  if (!course.manifest || course.manifest.modules.length === 0) {
    return false;
  }
  return true;
};

export const canArchiveCourse = (course: Course): boolean => {
  return course.status === "PUBLISHED";
};

export const canUpdateCourse = (course: Course): boolean => {
  return course.status !== "ARCHIVED";
};

export const canDeleteCourse = (course: Course): boolean => {
  return course.status === "DRAFT";
};

export const transitionCourseStatus = (
  currentStatus: CourseStatus,
  newStatus: CourseStatus
): void => {
  const validTransitions: Record<CourseStatus, CourseStatus[]> = {
    DRAFT: ["PUBLISHED"],
    PUBLISHED: ["ARCHIVED"],
    ARCHIVED: ["PUBLISHED"],
  };

  const allowedTransitions = validTransitions[currentStatus];
  if (!allowedTransitions.includes(newStatus)) {
    throw new DomainError(
      `Cannot transition from ${currentStatus} to ${newStatus}`
    );
  }
};

export const generateUrlSlug = (courseName: string): string => {
  return courseName
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

export const calculateCourseDuration = (course: Course): number => {
  let totalDuration = 0;
  for (const module of course.manifest.modules) {
    for (const lesson of module.lessons) {
      if (lesson.duration) {
        totalDuration += lesson.duration;
      }
    }
  }
  return totalDuration;
};

export const countCourseAssets = (course: Course): number => {
  let totalAssets = 0;
  for (const module of course.manifest.modules) {
    totalAssets += module.lessons.length;
  }
  return totalAssets;
};
