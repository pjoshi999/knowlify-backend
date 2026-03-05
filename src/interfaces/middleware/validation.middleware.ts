import { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodSchema } from "zod";
import { ValidationError } from "../../domain/errors/domain.errors.js";

export const validateRequest = <T extends ZodSchema>(
  schema: T,
  source: "body" | "query" | "params" = "body"
): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const data = req[source];
      schema.parse(data);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map(
          (err) => `${err.path.join(".")}: ${err.message}`
        );
        next(new ValidationError(messages.join(", ")));
      } else {
        next(error);
      }
    }
  };
};

// Common validation schemas
export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20)),
});

export const idSchema = z.object({
  id: z.string().uuid("Invalid ID format"),
});

export const emailSchema = z.string().email("Invalid email format");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");
