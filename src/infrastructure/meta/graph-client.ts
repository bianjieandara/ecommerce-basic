// The one Meta Graph API client, shared by the WhatsApp adapters (and the Conversions API later). It adds the version and the
// bearer token, sends JSON or form bodies, gives up after 10 s, and maps Meta's failures onto the two error families the job
// queue understands: temporary failures are retried, rejected requests are not.
import { DomainError, RetryableError } from '@/domain/shared/errors';
import { workersFetch } from '@/infrastructure/system/http-fetch';

/** Longest a Graph request may take before it is abandoned. */
const TIMEOUT_MS = 10_000;

/** Meta error codes that mean "too many calls"; they are retried like a 429. */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);

/** Meta error code for an invalid or expired access token. */
const INVALID_TOKEN_CODE = 190;

/** Connection settings. Both are null until the store has connected Meta. */
export interface GraphConfig {
  /** Graph API version, for example "v21.0" (META_GRAPH_VERSION). */
  version: string | null;
  /** System-user access token (WHATSAPP_TOKEN). Never logged or returned. */
  token: string | null;
}

/** Options of one request. */
export interface GraphRequest {
  method: 'GET' | 'POST';
  /** Query string values. */
  query?: Record<string, string>;
  /** JSON body; sets the content type. */
  json?: unknown;
  /** Raw body, such as form data or an upload. */
  body?: BodyInit;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** Authorization scheme. Uploads use "OAuth"; everything else uses "Bearer". */
  scheme?: 'Bearer' | 'OAuth';
}

/** Shape of the error Meta returns with a failed request. */
interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

/** The Graph client. Call `isConfigured()` first; a request without settings throws INVALID_STATE. */
export class MetaGraphClient {
  /**
   * @param config Version and token from the Worker settings.
   * @param fetcher Fetch implementation; the default is the Workers-safe wrapper.
   */
  constructor(
    private readonly config: GraphConfig,
    private readonly fetcher: typeof fetch = workersFetch,
  ) {}

  /** True when the version and the token are both set. */
  isConfigured(): boolean {
    return Boolean(this.config.version && this.config.token);
  }

  /**
   * Sends one request to the Graph API and returns the parsed answer.
   * @param path Path under the version, without a leading slash, for example "123/messages".
   * @param request Method, query, body and headers.
   * @returns The parsed JSON answer.
   * @throws DomainError INVALID_STATE when Meta is not configured; FORBIDDEN for a rejected token; VALIDATION_FAILED for any
   *   other refused request.
   * @throws RetryableError for rate limits, server errors, timeouts and network failures.
   */
  async request<T>(path: string, request: GraphRequest): Promise<T> {
    if (!this.isConfigured()) {
      throw new DomainError('INVALID_STATE', 'Meta Graph is not configured.', { reason: 'NOT_CONNECTED' });
    }
    // Built by concatenation: upload session ids contain colons, which `new URL(path, base)` would read as a scheme.
    const url = new URL(`https://graph.facebook.com/${this.config.version}/${path}`);
    for (const [name, value] of Object.entries(request.query ?? {})) url.searchParams.set(name, value);

    const headers = new Headers(request.headers);
    headers.set('authorization', `${request.scheme ?? 'Bearer'} ${this.config.token}`);
    let body: BodyInit | undefined = request.body;
    if (request.json !== undefined) {
      headers.set('content-type', 'application/json');
      body = JSON.stringify(request.json);
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: request.method,
        headers,
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new RetryableError(`Meta request failed: ${describe(error)}`);
    }
    const text = await response.text();
    const data = parseBody(text);
    if (response.ok) return data as T;
    throw failureFor(response, data);
  }

  /**
   * GET request.
   * @param path Path under the version.
   * @param query Query string values.
   */
  get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return this.request<T>(path, { method: 'GET', query });
  }

  /**
   * POST with a JSON body.
   * @param path Path under the version.
   * @param json Body to send.
   */
  postJson<T>(path: string, json: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', json });
  }
}

/**
 * Parses an answer body. A body that is not JSON becomes an empty object, so the status code decides the outcome.
 * @param text Raw body.
 */
function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * Describes a thrown value for a log line, without any request data.
 * @param error Thrown value.
 */
function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error';
}

/**
 * Turns a failed answer into the error the queue or the admin screen needs.
 * @param response Failed response.
 * @param data Parsed body, which may hold Meta's error.
 * @returns A RetryableError for temporary failures, otherwise a DomainError.
 */
function failureFor(response: Response, data: unknown): Error {
  const meta = (data as GraphErrorBody | null)?.error ?? {};
  const message = meta.message ?? `Meta answered ${response.status}`;
  const code = meta.code ?? null;
  if (response.status === 429 || response.status >= 500 || (code !== null && RATE_LIMIT_CODES.has(code))) {
    const retryAfter = Number(response.headers.get('retry-after'));
    return new RetryableError(
      `Meta is busy: ${message}`,
      Number.isFinite(retryAfter) ? retryAfter : undefined,
    );
  }
  if (response.status === 401 || response.status === 403 || code === INVALID_TOKEN_CODE) {
    return new DomainError('FORBIDDEN', `Meta rejected the access token: ${message}`, {
      provider: 'meta',
      code,
    });
  }
  return new DomainError('VALIDATION_FAILED', message, {
    provider: 'meta',
    code,
    subcode: meta.error_subcode ?? null,
  });
}
