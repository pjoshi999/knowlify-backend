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
    for (const course of courses.data) {
      totalEnrollments += course.enrollmentCount || 0;
    }

    // Calculate average rating
    const ratingsSum = courses.data.reduce(
      (sum: number, course: CourseWithStats) => sum + (course.avgRating || 0),
      0
    );
    const averageRating =
      publishedCourses > 0 ? ratingsSum / publishedCourses : 0;

    // Get revenue stats (would need to implement in payment repository)
    // For now, return placeholder values
    const totalRevenue = 0;
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
