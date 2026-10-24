// Health endpoint: confirms the Worker responds and that D1 answers a trivial query.
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  // Public and it queries D1, so it shares the API limit instead of being a free way to load the database.
  rateLimit: 'api',
  handler: ({ context }) => context.locals.app.health.checkDatabase().then((d1) => ({ ok: true, d1 })),
});
