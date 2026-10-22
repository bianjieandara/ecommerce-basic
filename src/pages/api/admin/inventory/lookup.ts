// Scanner and search lookup: finds the variant that has a SKU or a barcode. The admin's language names the product.
import { lookupInput } from '@/application/inventory/schemas';
import { DomainError } from '@/domain/shared/errors';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  input: lookupInput,
  handler: async ({ input, context }) => {
    const app = context.locals.app;
    const admin = requireAdmin(context.locals.admin);
    const inventory = await app.settings.get('inventory');
    const row = await app.inventory.queries.findVariantByCode(
      input.code,
      admin.locale,
      inventory.defaultLowStockThreshold,
    );
    if (!row) throw new DomainError('NOT_FOUND', 'No product has this SKU or barcode');
    return row;
  },
});
