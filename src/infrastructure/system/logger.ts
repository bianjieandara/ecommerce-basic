// Structured logs as one JSON line per event. Workers Logs (enabled in wrangler.base.jsonc) indexes the fields.
// Never log secrets, tokens or full personal data; pass ids and counts only.

/**
 * Writes one structured log line.
 * @param event Stable event name, for example "job.retry".
 * @param data Small set of fields (ids, counts, short reasons).
 */
export function logEvent(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ...data }));
}
