// Browser event beacon: records up to ten storefront events (product view, add to cart, checkout) and, with marketing consent,
// queues them for Meta. Public and rate limited with the API bucket; the body is validated before anything is recorded.
import { trackEventsInput } from '@/application/marketing/track-event-schemas';
import { eventContextOf } from '@/http/analytics';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  rateLimit: 'api',
  input: trackEventsInput,
  handler: ({ input, context }) =>
    context.locals.app.trackEvent.execute(input.events, eventContextOf(context.request)),
});
