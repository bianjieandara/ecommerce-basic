// Serves stored images through the Cloudflare edge cache. A stored image never changes (its key holds the asset id and the width),
// so after the first read from R2 every later request in the same location is answered from the edge, and a browser that
// already has the file gets a 304 instead of the bytes.
import type { BackgroundTasks } from '@/application/ports/platform';

/** One long-lived policy for browsers and the edge: the key changes when the image does. */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/** What serving an image needs from the platform. */
export interface MediaServing {
  request: Request;
  /** Validated storage key, for example "media/<id>/480.webp". */
  key: string;
  /** Reads the object from storage. */
  read: (key: string) => Promise<{ body: ReadableStream; contentType: string; etag: string } | null>;
  /** Keeps the cache write alive after the response is sent. */
  background: BackgroundTasks;
}

/**
 * Whether the browser's validator names this version of the file.
 * @param header If-None-Match request header, or null.
 * @param etag Current ETag.
 * @returns True when the browser's copy is current.
 */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const strip = (value: string) => value.trim().replace(/^W\//, '');
  return header === '*' || header.split(',').some((candidate) => strip(candidate) === strip(etag));
}

/**
 * Builds the answer for a file: 304 when the browser already has it, otherwise the file.
 * @param request Incoming request.
 * @param body File bytes.
 * @param contentType Media type.
 * @param etag ETag.
 * @returns The response.
 */
function answer(request: Request, body: ReadableStream | null, contentType: string, etag: string): Response {
  const headers = { 'Content-Type': contentType, 'Cache-Control': IMMUTABLE, ETag: etag };
  if (etagMatches(request.headers.get('if-none-match'), etag)) {
    // The file is not sent, so a stream nobody reads must not stay open.
    void body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers });
}

/**
 * Serves an image from the edge cache, filling the cache from storage on the first request.
 * @param serving Request, key, storage read and background hook.
 * @returns The image, a 304, or 404 when storage has no such file (a 404 is never stored).
 */
export async function serveMedia(serving: MediaServing): Promise<Response> {
  const { request, key, read, background } = serving;
  // The DOM typings of CacheStorage lack `default`, the Workers edge cache; the runtime has it.
  const cache = typeof caches === 'undefined' ? null : (caches as unknown as { default: Cache }).default;
  const cacheKey = `https://media-cache.internal/${key}`;

  const cached = cache ? await cache.match(cacheKey) : undefined;
  if (cached) {
    return answer(
      request,
      cached.body,
      cached.headers.get('content-type') ?? '',
      cached.headers.get('etag') ?? '',
    );
  }

  const object = await read(key);
  if (!object) return new Response('Not found', { status: 404 });
  if (!cache) return answer(request, object.body, object.contentType, object.etag);

  const [forBrowser, forCache] = object.body.tee();
  background.run(
    cache.put(
      cacheKey,
      new Response(forCache, {
        headers: { 'Content-Type': object.contentType, 'Cache-Control': IMMUTABLE, ETag: object.etag },
      }),
    ),
  );
  return answer(request, forBrowser, object.contentType, object.etag);
}
