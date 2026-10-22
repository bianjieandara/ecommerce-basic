// Saves one shipping method: a new one when the body has no id, otherwise an update of that method.
import { shippingMethodInput } from '@/application/ordering/shipping-schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: shippingMethodInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.contentAdmin.manageShipping.save(requireAdmin(context.locals.admin), input),
});
