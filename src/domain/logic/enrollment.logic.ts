import { Enrollment, EnrollmentProgress } from "../types/enrollment.types.js";
import { Course } from "../types/course.types.js";

export const canEnrollInCourse = (
  course: Course,
  existingEnrollment?: Enrollment | null
): boolean => {
  if (course.status !== "PUBLISHED") {
    return false;
  }
  if (existingEnrollment) {
    return false;
  }
  return true;
};

export const calculateCompletionPercentage = (
  progress: EnrollmentProgress,
  course: Course
): number => {
  const totalLessons = countTotalLessons(course);
  if (totalLessons === 0) {
    return 0;
  }
  const completedLessons = progress.completedLessons.length;
  return Math.round((completedLessons / totalLessons) * 100);
};

export const countTotalLessons = (course: Course): number => {
  let total = 0;
  for (const module of course.manifest.modules) {
    total += module.lessons.length;
  }
  return total;
};

export const isLessonCompleted = (
  lessonId: string,
  progress: EnrollmentProgress
): boolean => {
  return progress.completedLessons.includes(lessonId);
};

export const markLessonComplete = (
  lessonId: string,
  progress: EnrollmentProgress
): EnrollmentProgress => {
  if (progress.completedLessons.includes(lessonId)) {
    return progress;
  }
  return {
    ...progress,
    completedLessons: [...progress.completedLessons, lessonId],
  };
};

export const updateVideoProgress = (
  videoId: string,
  position: number,
  duration: number,
  progress: EnrollmentProgress
): EnrollmentProgress => {
  const completed = position >= duration * 0.9;
  return {
    ...progress,
    watchedVideos: {
      ...progress.watchedVideos,
      [videoId]: {
        lastPosition: position,
        duration,
        completed,
        watchedAt: new Date(),
      },
    },
  };
};

export const canReviewCourse = (enrollment: Enrollment): boolean => {
  const completionPercentage = enrollment.progress.completedLessons.length;
  return completionPercentage > 0;
};
