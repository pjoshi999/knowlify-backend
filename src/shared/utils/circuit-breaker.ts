import { logger } from "../logger";

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerOptions {
  failureThreshold: number; // Percentage (0-1)
  failureWindow: number; // Time window in ms
  openTimeout: number; // Time to wait before half-open in ms
  successThreshold: number; // Consecutive successes to close
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number[] = []; // Timestamps of failures
  private successes: number = 0;
  private lastOpenTime: number = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastOpenTime >= this.options.openTimeout) {
        logger.info({
          message: "Circuit breaker transitioning to HALF_OPEN",
          name: this.options.name,
        });
        this.state = CircuitState.HALF_OPEN;
        this.successes = 0;
      } else {
        throw new Error(`Circuit breaker is OPEN for ${this.options.name}`);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      logger.debug({
        message: "Circuit breaker success in HALF_OPEN",
        name: this.options.name,
        successes: this.successes,
        threshold: this.options.successThreshold,
      });

      if (this.successes >= this.options.successThreshold) {
        logger.info({
          message: "Circuit breaker closing",
          name: this.options.name,
        });
        this.state = CircuitState.CLOSED;
        this.failures = [];
        this.successes = 0;
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Clean up old failures outside the window
      const now = Date.now();
      this.failures = this.failures.filter(
        (timestamp) => now - timestamp < this.options.failureWindow
      );
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);

    // Clean up old failures outside the window
    this.failures = this.failures.filter(
      (timestamp) => now - timestamp < this.options.failureWindow
    );

    if (this.state === CircuitState.HALF_OPEN) {
      logger.warn({
        message: "Circuit breaker opening from HALF_OPEN",
        name: this.options.name,
      });
      this.state = CircuitState.OPEN;
      this.lastOpenTime = now;
      this.successes = 0;
      return;
    }

    if (this.state === CircuitState.CLOSED) {
      const failureRate =
        this.failures.length / (this.options.failureWindow / 1000);
      const threshold = this.options.failureThreshold;

      logger.debug({
        message: "Circuit breaker failure recorded",
        name: this.options.name,
        failures: this.failures.length,
        failureRate,
        threshold,
      });

      if (failureRate >= threshold) {
        logger.warn({
          message: "Circuit breaker opening",
          name: this.options.name,
          failureRate,
          threshold,
        });
        this.state = CircuitState.OPEN;
        this.lastOpenTime = now;
      }
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = [];
    this.successes = 0;
    this.lastOpenTime = 0;
    logger.info({ message: "Circuit breaker reset", name: this.options.name });
  }
}

// Pre-configured circuit breakers for common services
export const s3CircuitBreaker = new CircuitBreaker({
  name: "S3",
  failureThreshold: 0.5, // 50% failure rate
  failureWindow: 60000, // 1 minute
  openTimeout: 30000, // 30 seconds
  successThreshold: 10,
});

export const sqsCircuitBreaker = new CircuitBreaker({
  name: "SQS",
  failureThreshold: 0.5,
  failureWindow: 60000,
  openTimeout: 30000,
  successThreshold: 10,
});

export const redisCircuitBreaker = new CircuitBreaker({
  name: "Redis",
  failureThreshold: 0.5,
  failureWindow: 60000,
  openTimeout: 30000,
  successThreshold: 10,
});
