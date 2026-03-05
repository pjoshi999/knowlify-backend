export class DomainError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    options?: {
      code?: string;
      statusCode?: number;
      details?: unknown;
    }
  ) {
    super(message);
    this.code = options?.code ?? "DOMAIN_ERROR";
    this.statusCode = options?.statusCode ?? 400;
    this.details = options?.details;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message, {
      code: "VALIDATION_ERROR",
      statusCode: 422,
      details: field ? { field } : undefined,
    });
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    const message = resource.toLowerCase().includes("not found")
      ? resource
      : id
        ? `${resource} with id ${id} not found`
        : `${resource} not found`;

    super(message, {
      code: "NOT_FOUND",
      statusCode: 404,
    });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = "Unauthorized") {
    super(message, {
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = "Forbidden") {
    super(message, {
      code: "FORBIDDEN",
      statusCode: 403,
    });
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, {
      code: "CONFLICT",
      statusCode: 409,
    });
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("Invalid email or password", {
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  }
}

export class TokenExpiredError extends UnauthorizedError {
  constructor() {
    super("Token has expired");
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor() {
    super("Invalid token");
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(email: string) {
    super(`User with email ${email} already exists`);
  }
}

export class InsufficientPermissionsError extends ForbiddenError {
  constructor(action: string) {
    super(`Insufficient permissions to ${action}`);
  }
}
