// Demo reset on demand: the owner can restore the sample store now, the same way the nightly job does. Refused outside demo mode
// and for users who may not change settings. A form post, so the answer is a redirect back to the dashboard.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';
import { ADMIN_PATHS } from '@/domain/shared/paths';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'forms',
  handler: async ({ context }) => {
    await context.locals.app.demo.resetDemo.execute(requireAdmin(context.locals.admin));
    return new Response(null, { status: 303, headers: { Location: ADMIN_PATHS.dashboard } });
  },
});
