export interface Enrollment {
  id: string;
  studentId: string;
  courseId: string;
  paymentId: string;
  progress: EnrollmentProgress;
  enrolledAt: Date;
  lastAccessedAt: Date;
  completedAt?: Date;
}

export interface EnrollmentProgress {
  completedLessons: string[];
  watchedVideos: Record<string, VideoProgress>;
  quizScores?: Record<string, number>;
  examScores?: Record<string, number>;
}

export interface VideoProgress {
  lastPosition: number;
  duration: number;
  completed: boolean;
  watchedAt: Date;
}

export interface CreateEnrollmentInput {
  studentId: string;
  courseId: string;
  paymentId: string;
}

export interface UpdateProgressInput {
  lessonId?: string;
  videoId?: string;
  position?: number;
  completed?: boolean;
  quizId?: string;
  quizScore?: number;
}

export interface EnrollmentWithCourse extends Enrollment {
  courseName: string;
  courseThumbnailUrl?: string;
  instructorName: string;
  completionPercentage: number;
}
