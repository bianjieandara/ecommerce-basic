// Endpoint factory: every API route is built with this, so parsing, errors and response shape are consistent.
// Stage 5 supports public GET and POST routes. Admin auth, rate limits and bot checks are added in Stages 13 and 23.
import type { APIContext, APIRoute } from 'astro';
import { z } from 'zod';
import { DomainError } from '@/domain/shared/errors';
import { errorResponse } from './errors';

/** Largest JSON body accepted by a public endpoint. */
const MAX_JSON_BYTES = 64 * 1024;

/** Options for one endpoint. */
export interface EndpointOptions<S extends z.ZodType, R> {
  method: 'GET' | 'POST';
  /** Zod schema for the query string (GET) or the JSON body (POST). */
  input?: S;
  handler: (context: { input: z.infer<S>; context: APIContext }) => Promise<R>;
}

/**
 * Creates an Astro API route with validation and error mapping.
 * Success responses are `{ ok: true, data }`; failures are `{ ok: false, error }` with a proper status.
 * @param options Method, input schema and handler.
 * @returns An APIRoute to export as GET or POST.
 */
export function defineEndpoint<S extends z.ZodType, R>(options: EndpointOptions<S, R>): APIRoute {
  return async (context) => {
    const requestId = context.locals.requestId;
    try {
      const raw =
        options.method === 'GET'
          ? Object.fromEntries(context.url.searchParams)
          : await readJson(context.request);
      const input = options.input ? parse(options.input, raw) : (undefined as z.infer<S>);
      const data = await options.handler({ input, context });
      return Response.json({ ok: true, data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

/**
 * Reads a JSON body with a size limit.
 * @param request Incoming request.
 * @returns Parsed JSON value.
 * @throws DomainError VALIDATION_FAILED for a missing, oversized or malformed body.
 */
async function readJson(request: Request): Promise<unknown> {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_JSON_BYTES) throw new DomainError('VALIDATION_FAILED', 'Request body too large');
  try {
    return await request.json();
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
      result.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }
  return result.data;
}
