import { CourseRepositoryPort } from "../../ports/course.repository.port.js";
import { CourseWithStats } from "../../../domain/types/course.types.js";

export interface InstructorStats {
  totalCourses: number;
  publishedCourses: number;
  totalEnrollments: number;
  totalRevenue: number;
  averageRating: number;
  recentEnrollments: number; // Last 30 days
  recentRevenue: number; // Last 30 days
}

export type GetInstructorStatsUseCase = (
  instructorId: string
) => Promise<InstructorStats>;

export const createGetInstructorStatsUseCase = (
  courseRepository: CourseRepositoryPort
): GetInstructorStatsUseCase => {
  return async (instructorId: string): Promise<InstructorStats> => {
    // Get instructor's courses
    const courses = await courseRepository.findAll(
      { instructorId },
      { page: 1, limit: 1000 }
    );

    // Calculate stats
    const totalCourses = courses.data.length;
    const publishedCourses = courses.data.filter(
      (c: CourseWithStats) => c.status === "PUBLISHED"
    ).length;

    // Get total enrollments across all courses
    let totalEnrollments = 0;
    let totalRevenue = 0;
    let totalReviews = 0;
    let weightedRatingSum = 0;

    for (const course of courses.data) {
      totalEnrollments += course.enrollmentCount || 0;
      totalRevenue += course.totalRevenue || 0;

      // Weight ratings by number of reviews for accurate average
      const courseReviews = course.reviewCount || 0;
      const courseRating = course.avgRating || 0;
      totalReviews += courseReviews;
      weightedRatingSum += courseRating * courseReviews;
    }

    // Calculate weighted average rating
    const averageRating =
      totalReviews > 0 ? weightedRatingSum / totalReviews : 0;

    // TODO: Implement recent stats (last 30 days) - requires date filtering in repository
    const recentRevenue = 0;
    const recentEnrollments = 0;

    return {
      totalCourses,
      publishedCourses,
      totalEnrollments,
      totalRevenue,
      averageRating: Math.round(averageRating * 10) / 10,
      recentEnrollments,
      recentRevenue,
    };
  };
};
