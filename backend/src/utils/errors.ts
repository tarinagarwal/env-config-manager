export class AppError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 500,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(code: string, message: string, statusCode: number = 401) {
    super(code, message, statusCode);
    this.name = "AuthError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super("VALIDATION_INVALID_INPUT", message, 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("RESOURCE_NOT_FOUND", `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super("FORBIDDEN_INSUFFICIENT_PERMISSIONS", message, 403);
    this.name = "ForbiddenError";
  }
}
