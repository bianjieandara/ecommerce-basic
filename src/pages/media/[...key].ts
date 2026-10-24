// Serves stored images from R2 through the edge cache. Keys are validated so a request can only reach media objects, never other buckets' paths.
import type { APIRoute } from 'astro';
import { serveMedia } from '@/http/media-cache';

const MEDIA_KEY = /^media\/[0-9a-f-]{36}\/[0-9]{3,4}\.(webp|jpg|png)$/i;

export const GET: APIRoute = async ({ params, locals, request }) => {
  const key = params.key ?? '';
  if (!MEDIA_KEY.test(key)) return new Response('Not found', { status: 404 });
  return serveMedia({
    request,
    key,
    read: (name) => locals.app.media.get(name),
    background: locals.app.platform.background,
  });
};
