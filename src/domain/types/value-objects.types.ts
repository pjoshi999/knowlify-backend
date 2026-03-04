export interface Money {
  amount: number;
  currency: string;
}

export interface CourseMetadata {
  totalDuration?: number;
  totalLessons?: number;
  totalVideos?: number;
  totalQuizzes?: number;
  totalExams?: number;
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  language?: string;
  subtitles?: string[];
  prerequisites?: string[];
  learningOutcomes?: string[];
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface SearchResult<T> {
  results: T[];
  total: number;
  query: string;
  filters?: Record<string, unknown>;
}

export const createMoney = (amount: number, currency = "USD"): Money => ({
  amount,
  currency,
});

export const formatMoney = (money: Money): string => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: money.currency,
  });
  return formatter.format(money.amount / 100);
};

export const compareMoney = (a: Money, b: Money): number => {
  if (a.currency !== b.currency) {
    throw new Error("Cannot compare money with different currencies");
  }
  return a.amount - b.amount;
};
