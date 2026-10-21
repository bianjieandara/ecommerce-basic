// Contact form endpoint: stores the message and queues its notifications. Rate limited per client IP; the bot check runs
// inside the use case.
import { defineEndpoint } from '@/http/define-endpoint';
import { contactMessageInput } from '@/application/content/contact-schemas';
import { DomainError } from '@/domain/shared/errors';

export const POST = defineEndpoint({
  method: 'POST',
  input: contactMessageInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const ip = context.request.headers.get('CF-Connecting-IP');
    if (!(await app.platform.rateLimiter.allow('forms', ip ?? 'unknown'))) {
      throw new DomainError('RATE_LIMITED', 'Too many attempts. Please wait a moment.');
    }
    return app.submitContact.execute(input, { ip });
  },
});
