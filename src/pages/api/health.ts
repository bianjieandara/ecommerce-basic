// Health endpoint: confirms the Worker responds and that D1 answers a trivial query.
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  handler: ({ context }) => context.locals.app.health.checkDatabase().then((d1) => ({ ok: true, d1 })),
});
