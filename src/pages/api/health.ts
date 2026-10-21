// Health endpoint: confirms the Worker responds and that D1 answers a trivial query.
// Switches to `Astro.locals.app` in Stage 5.
import type { APIRoute } from 'astro';
import { getEnv } from '@/http/cloudflare-env';

export const GET: APIRoute = async () => {
  let d1 = true;
  try {
    await getEnv().DB.prepare('SELECT 1').first();
  } catch {
    d1 = false;
  }
  return Response.json({ ok: true, d1 });
};
