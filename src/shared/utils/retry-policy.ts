import { logger } from "../logger";

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number; // Base delay in ms
  maxDelay: number; // Maximum delay in ms
  retryableErrors?: string[]; // Error names/codes to retry
  onRetry?: (attempt: number, error: Error) => void;
}

export class RetryPolicy {
  private static readonly DEFAULT_RETRYABLE_ERRORS = [
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ENETUNREACH",
    "NetworkingError",
    "TimeoutError",
    "ServiceUnavailable",
    "ThrottlingException",
  ];

  static async execute<T>(
    fn: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    let lastError: Error;
    const retryableErrors =
      options.retryableErrors || this.DEFAULT_RETRYABLE_ERRORS;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        const isRetryable = this.isRetryableError(
          error as Error,
          retryableErrors
        );

        if (!isRetryable || attempt === options.maxRetries) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(attempt, options);

        // Check for Retry-After header (for rate limit errors)
        const retryAfter = this.getRetryAfter(error as any);
        const actualDelay = retryAfter ? retryAfter * 1000 : delay;

        logger.warn({
          message: "Retrying operation",
          attempt: attempt + 1,
          maxRetries: options.maxRetries,
          delay: actualDelay,
          error: (error as Error).message,
        });

        if (options.onRetry) {
          options.onRetry(attempt + 1, error as Error);
        }

        await this.sleep(actualDelay);
      }
    }

    throw lastError!;
  }

  private static isRetryableError(
    error: Error,
    retryableErrors: string[]
  ): boolean {
    const errorName = error.name;
    const errorCode = (error as any).code;
    const errorMessage = error.message;

    return retryableErrors.some(
      (retryable) =>
        errorName === retryable ||
        errorCode === retryable ||
        errorMessage.includes(retryable)
    );
  }

  private static calculateDelay(
    attempt: number,
    options: RetryOptions
  ): number {
    // Exponential backoff: baseDelay * 2^attempt
    const exponentialDelay = options.baseDelay * Math.pow(2, attempt);

    // Add jitter (random 0-25% of delay)
    const jitter = exponentialDelay * Math.random() * 0.25;

    const delay = exponentialDelay + jitter;

    return Math.min(delay, options.maxDelay);
  }

  private static getRetryAfter(error: any): number | null {
    // Check for Retry-After header in error response
    if (error.response?.headers?.["retry-after"]) {
      const retryAfter = error.response.headers["retry-after"];
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? null : seconds;
    }

    // Check for retryAfter in error object
    if (error.retryAfter && typeof error.retryAfter === "number") {
      return error.retryAfter;
    }

    return null;
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Pre-configured retry policies
export const networkRetryPolicy: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 8000, // 8 seconds
};

export const s3RetryPolicy: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  retryableErrors: [
    "RequestTimeout",
    "ServiceUnavailable",
    "SlowDown",
    "InternalError",
    "NetworkingError",
  ],
};

export const sqsRetryPolicy: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 8000,
  retryableErrors: [
    "ServiceUnavailable",
    "ThrottlingException",
    "RequestTimeout",
    "NetworkingError",
  ],
};

export const redisRetryPolicy: RetryOptions = {
  maxRetries: 2,
  baseDelay: 500,
  maxDelay: 2000,
  retryableErrors: ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ConnectionError"],
};
