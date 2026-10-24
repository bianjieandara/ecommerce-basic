// Endpoint factory: every API route is built with this, so parsing, errors and response shape are consistent.
// Auth is enforced by the middleware; this file validates input, runs the handler and maps errors to responses.
import type { APIContext, APIRoute } from 'astro';
import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '@/domain/media/media-asset';
import { DomainError } from '@/domain/shared/errors';
import type { RateLimitBucket } from '@/application/ports/platform';
import { errorResponse } from './errors';
import { bumpPageCache } from './page-cache';

/** Largest JSON body accepted by an endpoint. */
const MAX_JSON_BYTES = 64 * 1024;

/** Largest form body: one upload plus room for field names and multipart boundaries. */
const MAX_FORM_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

/** Options for one endpoint. */
export interface EndpointOptions<S extends z.ZodType, R> {
  method: 'GET' | 'POST';
  /** Zod schema for the query string (GET) or the body. Without one, the body is not read at all. */
  input?: S;
  /** How the body is read: JSON by default, or form fields for uploads. */
  body?: 'json' | 'form';
  /** Set on admin changes: the page cache is invalidated once the handler succeeds. */
  invalidatesCache?: boolean;
  /**
   * Lets the visitor's browser reuse a successful answer for this many seconds. For public, read-only GET endpoints whose
   * answer is the same for everyone (search suggestions, result counts); every other endpoint answers `no-store`.
   */
  browserCacheSeconds?: number;
  /**
   * Limits requests per client IP before anything else runs, so a flood is turned away without parsing its body. A bucket name
   * uses that bucket; `{ bucket, scope }` keeps its own counter, for an endpoint that must not share one with the others.
   */
  rateLimit?: RateLimitBucket | { bucket: RateLimitBucket; scope: string };
  handler: (context: { input: z.infer<S>; context: APIContext }) => Promise<R>;
}

/**
 * Creates an Astro API route with validation and error mapping.
 * Success responses are `{ ok: true, data }`; failures are `{ ok: false, error }` with a proper status.
 * @param options Method, input schema, body kind and handler.
 * @returns An APIRoute to export as GET or POST.
 */
export function defineEndpoint<S extends z.ZodType, R>(options: EndpointOptions<S, R>): APIRoute {
  return async (context) => {
    const requestId = context.locals.requestId;
    try {
      if (options.rateLimit) await enforceRateLimit(context, options.rateLimit);
      // Endpoints without an input schema never read the body, so a plain form post (sign-out) works too.
      const raw =
        options.method === 'GET'
          ? Object.fromEntries(context.url.searchParams)
          : options.input
            ? await readBody(context.request, options.body ?? 'json')
            : undefined;
      const input = options.input ? parse(options.input, raw) : (undefined as z.infer<S>);
      const data = await options.handler({ input, context });
      if (options.invalidatesCache) await bumpPageCache(context.locals.app.platform.pageCache, requestId);
      // A handler that needs more than JSON (for example a session cookie) returns its own Response.
      if (data instanceof Response) return data;
      const cacheControl = options.browserCacheSeconds
        ? `public, max-age=${options.browserCacheSeconds}`
        : 'no-store';
      return Response.json({ ok: true, data }, { headers: { 'Cache-Control': cacheControl } });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

/**
 * Reads the body up to a byte limit. The Content-Length header is only a hint a client can leave out or lie about, so the
 * limit is enforced on the bytes actually received and the stream is cancelled as soon as it is passed.
 * @param request Incoming request.
 * @param limit Most bytes accepted.
 * @returns The body bytes.
 * @throws DomainError VALIDATION_FAILED when the body is larger than the limit.
 */
export async function readCapped(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new DomainError('VALIDATION_FAILED', 'Request body too large');
  if (Number(request.headers.get('content-length') ?? '0') > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Reads the request body with a size limit.
 * @param request Incoming request.
 * @param kind JSON, or form fields for uploads.
 * @returns The parsed body.
 * @throws DomainError VALIDATION_FAILED for a missing, oversized or malformed body.
 */
async function readBody(request: Request, kind: 'json' | 'form'): Promise<unknown> {
  const bytes = await readCapped(request, kind === 'form' ? MAX_FORM_BYTES : MAX_JSON_BYTES);
  if (kind === 'form') {
    try {
      const form = await new Response(bytes, {
        headers: { 'content-type': request.headers.get('content-type') ?? '' },
      }).formData();
      return Object.fromEntries(form);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Request body must be form data');
    }
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DomainError('VALIDATION_FAILED', 'Request body must be JSON');
  }
}

/**
 * Validates input with a schema and turns failures into a DomainError with field details.
 * @param schema Zod schema.
 * @param raw Unvalidated input.
 * @returns Parsed input.
 * @throws DomainError VALIDATION_FAILED with the zod issues.
 */
function parse<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new DomainError(
      'VALIDATION_FAILED',
      'Invalid input',
      // The shape the use cases return too, so one form handler reads both: dotted field paths in `issues`.
      {
        issues: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    );
  }
  return result.data;
}

/**
 * Turns the request away when the client IP has used up its limit.
 * @param context Astro context of the request.
 * @param limit Bucket, or bucket and scope.
 * @throws DomainError RATE_LIMITED.
 */
export async function enforceRateLimit(
  context: APIContext,
  limit: NonNullable<EndpointOptions<z.ZodType, unknown>['rateLimit']>,
): Promise<void> {
  const { bucket, scope } = typeof limit === 'string' ? { bucket: limit, scope: null } : limit;
  const ip = context.request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (!(await context.locals.app.platform.rateLimiter.allow(bucket, scope ? `${scope}:${ip}` : ip))) {
    throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
  }
}
