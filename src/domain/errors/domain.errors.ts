export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id ${id} not found` : `${resource} not found`);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string = "Unauthorized") {
    super(message);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message: string = "Forbidden") {
    super(message);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super("Invalid email or password");
  }
}

export class TokenExpiredError extends DomainError {
  constructor() {
    super("Token has expired");
  }
}

export class InvalidTokenError extends DomainError {
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
