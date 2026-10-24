// Error types shared by every layer. HTTP maps DomainError codes to status codes (see src/http/errors.ts);
// job handlers use RetryableError for temporary failures so the queue retries them.

/** Stable machine-readable error codes. UI shows `errors.<code>` translations. */
export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'OUT_OF_STOCK'
  | 'PRODUCT_UNAVAILABLE'
  | 'PAYMENT_METHOD_UNAVAILABLE'
  | 'PAYMENT_PROVIDER_ERROR'
  | 'REFUND_REFUSED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'BOT_CHECK_FAILED'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'DEMO_LOCKED';

/** A business-rule or input error. Never retried automatically. */
export class DomainError extends Error {
  /**
   * @param code Stable error code.
   * @param message Developer-facing message (not shown to customers).
   * @param details Optional structured data, for example field errors.
   */
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

/** A temporary failure (network, rate limit, provider outage). Job handlers throw it to get a retry. */
export class RetryableError extends Error {
  /**
   * @param message Failure description for logs.
   * @param retryAfterSeconds Optional delay requested by the provider (for example a 429 Retry-After).
   */
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'RetryableError';
  }
}
