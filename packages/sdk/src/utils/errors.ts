export class TaggedError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'TaggedError';
  }
}

export class ApiError extends TaggedError {
  constructor(message: string, statusCode: number, public readonly response?: unknown) {
    super(message, statusCode, 'API_ERROR');
    this.name = 'ApiError';
  }
}

export class AuthenticationError extends TaggedError {
  constructor(message = 'Authentication failed. Please check your API key or login credentials.') {
    super(message, 401, 'AUTH_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends TaggedError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends TaggedError {
  constructor(resource = 'Resource') {
    super(`${resource} not found.`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends TaggedError {
  constructor(message: string, public readonly details?: Record<string, string[]>) {
    super(message, 422, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends TaggedError {
  constructor(
    message = 'Rate limit exceeded. Please try again later.',
    public readonly retryAfter?: number
  ) {
    super(message, 429, 'RATE_LIMIT');
    this.name = 'RateLimitError';
  }
}

export class NetworkError extends TaggedError {
  constructor(message = 'A network error occurred. Please check your connection.') {
    super(message, undefined, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class ConfigurationError extends TaggedError {
  constructor(message: string) {
    super(message, undefined, 'CONFIG_ERROR');
    this.name = 'ConfigurationError';
  }
}
