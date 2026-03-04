export const CacheKeys = {
  course: (id: string): string => `course:${id}`,
  courseList: (filters: string): string => `courses:list:${filters}`,
  courseStats: (id: string): string => `course:${id}:stats`,

  user: (id: string): string => `user:${id}`,
  userSession: (token: string): string => `session:${token}`,

  userEnrollments: (userId: string): string => `enrollments:user:${userId}`,
  courseEnrollments: (courseId: string): string =>
    `enrollments:course:${courseId}`,

  searchResults: (query: string, filters: string): string =>
    `search:${query}:${filters}`,

  rateLimit: (userId: string, endpoint: string): string =>
    `ratelimit:${userId}:${endpoint}`,

  assetUrl: (assetId: string): string => `asset:${assetId}:url`,

  chatSession: (sessionId: string): string => `chat:${sessionId}`,

  jobStatus: (jobId: string): string => `job:${jobId}:status`,
} as const;

export const CacheTTL = {
  courseList: 300,
  courseDetail: 600,
  courseStats: 300,
  userSession: 86400,
  userProfile: 3600,
  enrollments: 600,
  searchResults: 300,
  assetUrl: 86400,
  rateLimit: 60,
  chatSession: 3600,
  jobStatus: 300,
} as const;

export const generateCacheKey = (
  prefix: string,
  ...parts: (string | number)[]
): string => {
  return [prefix, ...parts].join(":");
};

export const parseCacheKey = (key: string): string[] => {
  return key.split(":");
};
