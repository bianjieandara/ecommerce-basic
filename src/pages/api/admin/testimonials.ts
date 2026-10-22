// Saves a testimonial: a new one without an id, or an update of the one with that id.
import { testimonialInput } from '@/application/content/testimonial-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: testimonialInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.contentAdmin.manageTestimonials.save(requireAdmin(context.locals.admin), input),
});
