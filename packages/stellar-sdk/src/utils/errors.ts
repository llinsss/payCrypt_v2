/**
 * Base error class for TaggedPay Stellar SDK errors
 */
export class TaggedPayError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode?: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TaggedPayError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TaggedPayError);
    }
  }
}

/**
 * Error thrown when API returns an error response
 */
export class ApiError extends TaggedPayError {
  constructor(
    message: string,
    statusCode: number,
    details?: Record<string, unknown>
  ) {
    super(message, 'API_ERROR', statusCode, details);
    this.name = 'ApiError';
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends TaggedPayError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when authorization fails
 */
export class AuthorizationError extends TaggedPayError {
  constructor(message: string = 'Access denied') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends TaggedPayError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends TaggedPayError {
  public readonly errors: Record<string, string[]>;

  constructor(
    message: string = 'Validation failed',
    errors: Record<string, string[]> = {}
  ) {
    super(message, 'VALIDATION_ERROR', 400, { errors });
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends TaggedPayError {
  public readonly retryAfter?: number;

  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when a network error occurs
 */
export class NetworkError extends TaggedPayError {
  constructor(message: string = 'Network error occurred') {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends TaggedPayError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT_ERROR');
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends TaggedPayError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR');
    this.name = 'ConfigurationError';
  }
}
