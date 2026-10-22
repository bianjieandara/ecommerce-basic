// Maps domain errors to HTTP responses. Customers see translated, generic messages; details stay in the logs.
import { DomainError, type ErrorCode } from '@/domain/shared/errors';
import { logEvent } from './log';

/** HTTP status for each domain error code. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  OUT_OF_STOCK: 409,
  PRODUCT_UNAVAILABLE: 409,
  CONFLICT: 409,
  INVALID_STATE: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  BOT_CHECK_FAILED: 400,
  PAYMENT_METHOD_UNAVAILABLE: 422,
  PAYMENT_PROVIDER_ERROR: 502,
};

/** Refusals worth a log line: who is being turned away, and provider failures. Validation and not-found stay quiet. */
const LOGGED_CODES: ReadonlySet<ErrorCode> = new Set([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'BOT_CHECK_FAILED',
  'PAYMENT_PROVIDER_ERROR',
]);

/**
 * Builds the JSON error response for any thrown value.
 * @param error Thrown value.
 * @param requestId Request id for log correlation.
 * @returns A JSON response with `{ ok: false, error: { code, message, details } }`.
 */
export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof DomainError) {
    if (LOGGED_CODES.has(error.code)) {
      logEvent('request.refused', { requestId, code: error.code, reason: error.message.slice(0, 200) });
    }
    return Response.json(
      { ok: false, error: { code: error.code, message: error.message, details: error.details ?? null } },
      { status: STATUS_BY_CODE[error.code] },
    );
  }
  logEvent('request.error', { requestId, reason: error instanceof Error ? error.message : String(error) });
  return Response.json(
    {
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.', details: null },
    },
    { status: 500 },
  );
}
