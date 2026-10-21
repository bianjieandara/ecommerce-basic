// Retry delays for failed deliveries. Used with message.retry({ delaySeconds }) in the queue consumer.

/** Delay in seconds before retry number 1, 2, 3... (the last value repeats). */
const RETRY_DELAYS_SECONDS = [30, 120, 600, 1800, 7200] as const;

/** Largest delay the queue accepts (24 hours). */
export const MAX_RETRY_DELAY_SECONDS = 86_400;

/**
 * Seconds to wait before the next attempt.
 * @param attempts Attempts already made (1 after the first failure).
 * @param requestedSeconds Delay requested by the provider (for example Retry-After), if any.
 * @returns Delay in seconds, between 1 and 86400.
 */
export function backoffSeconds(attempts: number, requestedSeconds?: number): number {
  const index = Math.max(0, Math.min(attempts, RETRY_DELAYS_SECONDS.length) - 1);
  const base = RETRY_DELAYS_SECONDS[index] ?? RETRY_DELAYS_SECONDS[RETRY_DELAYS_SECONDS.length - 1] ?? 7200;
  const chosen = requestedSeconds !== undefined ? Math.max(base, requestedSeconds) : base;
  return Math.min(MAX_RETRY_DELAY_SECONDS, Math.max(1, Math.ceil(chosen)));
}
