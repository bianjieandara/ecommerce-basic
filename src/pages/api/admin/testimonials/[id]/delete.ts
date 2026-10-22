// Deletes a testimonial. The page cache is invalidated because the storefront widget may show it.
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  invalidatesCache: true,
  handler: async ({ context }) => {
    await context.locals.app.contentAdmin.manageTestimonials.remove(
      requireAdmin(context.locals.admin),
      context.params.id ?? '',
    );
    return { deleted: true };
  },
});
