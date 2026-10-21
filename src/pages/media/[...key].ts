// Serves stored images from R2. Keys are validated so a request can only reach media objects, never other buckets' paths.
import type { APIRoute } from 'astro';

const MEDIA_KEY = /^media\/[0-9a-f-]{36}\/[0-9]{3,4}\.(webp|jpg|png)$/i;

export const GET: APIRoute = async ({ params, locals }) => {
  const key = params.key ?? '';
  if (!MEDIA_KEY.test(key)) return new Response('Not found', { status: 404 });
  const object = await locals.app.media.get(key);
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.etag,
    },
  });
};
