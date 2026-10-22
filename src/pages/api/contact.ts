// Contact form endpoint: stores the message and queues its notifications. Rate limited per client IP; the bot check runs
// inside the use case.
import { defineEndpoint } from '@/http/define-endpoint';
import { contactMessageInput } from '@/application/content/contact-schemas';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'forms',
  input: contactMessageInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    return app.submitContact.execute(input, { ip });
  },
});
