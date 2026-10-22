// Fetch helpers for admin islands. They always resolve, so callers never handle a thrown error: a network failure or an
// answer that is not JSON comes back as the code NETWORK, which islands show as their generic message.

/** Result of one admin call. `details` carries the field issues of a validation failure. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: string; message: string; details: unknown };

/** Envelope that the admin endpoints answer with. */
type Envelope<T> =
  { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } };

/**
 * Posts JSON to an admin endpoint.
 * @param url Endpoint path.
 * @param body Request body.
 * @returns The data on success, or the error.
 */
export function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return send<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Posts form data (uploads) to an admin endpoint.
 * @param url Endpoint path.
 * @param form Form data, with files.
 * @returns The data on success, or the error.
 */
export function postForm<T>(url: string, form: FormData): Promise<ApiResult<T>> {
  return send<T>(url, { method: 'POST', body: form });
}

/**
 * Reads data from an admin endpoint.
 * @param url Endpoint path with its query string.
 * @returns The data on success, or the error.
 */
export function getJson<T>(url: string): Promise<ApiResult<T>> {
  return send<T>(url, { method: 'GET' });
}

/**
 * Sends one request and reads the envelope.
 * @param url Endpoint path.
 * @param init Method, headers and body.
 * @returns The data on success, or the error.
 */
async function send<T>(url: string, init: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init);
    const json = (await response.json()) as Envelope<T>;
    return json.ok
      ? { ok: true, data: json.data }
      : {
          ok: false,
          code: json.error.code,
          message: json.error.message,
          details: json.error.details ?? null,
        };
  } catch {
    return { ok: false, code: 'NETWORK', message: '', details: null };
  }
}
