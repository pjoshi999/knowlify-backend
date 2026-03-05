import { z } from "zod";

export const createCourseSchema = z.object({
  name: z.string().min(3).max(500),
  description: z.string().min(10).max(5000),
  category: z.string().min(1).max(100),
  priceAmount: z.number().int().min(0).max(999999),
  priceCurrency: z.string().length(3).optional(),
  thumbnailUrl: z.string().url().optional(),
  manifest: z
    .object({
      modules: z.array(z.any()),
    })
    .optional(),
});

export const updateCourseSchema = z.object({
  name: z.string().min(3).max(500).optional(),
  description: z.string().min(10).max(5000).optional(),
  category: z.string().min(1).max(100).optional(),
  priceAmount: z.number().int().min(0).max(999999).optional(),
  priceCurrency: z.string().length(3).optional(),
  thumbnailUrl: z.string().url().optional(),
  manifest: z
    .object({
      modules: z.array(z.any()),
    })
    .optional(),
});

export const courseListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  category: z.string().optional(),
  minPrice: z.string().optional(),
  maxPrice: z.string().optional(),
  minRating: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  instructorId: z.string().uuid().optional(),
  search: z.string().optional(),
  sortBy: z
    .enum(["createdAt", "priceAmount", "enrollmentCount", "avgRating"])
    .optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});
