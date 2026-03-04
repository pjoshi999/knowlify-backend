export interface Review {
  id: string;
  studentId: string;
  courseId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateReviewInput {
  studentId: string;
  courseId: string;
  rating: number;
  comment?: string;
}

export interface UpdateReviewInput {
  rating?: number;
  comment?: string;
}

export interface ReviewWithStudent extends Review {
  studentName: string;
  studentAvatarUrl?: string;
}

export interface CourseRatingStats {
  avgRating: number;
  totalReviews: number;
  ratingDistribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}
