// Fetch helper for admin islands. It posts JSON and always resolves, so callers never handle a thrown error: a network
// failure or an answer that is not JSON comes back as the code NETWORK, which islands show as their generic message.

/** Result of one admin call. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** Envelope that the admin endpoints answer with. */
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/**
 * Posts JSON to an admin endpoint.
 * @param url Endpoint path.
 * @param body Request body.
 * @returns The data on success, or the error code and message.
 */
export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await response.json()) as Envelope<T>;
    return json.ok
      ? { ok: true, data: json.data }
      : { ok: false, code: json.error.code, message: json.error.message };
  } catch {
    return { ok: false, code: 'NETWORK', message: '' };
  }
}
