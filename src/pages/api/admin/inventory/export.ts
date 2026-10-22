// Stock count sheet: the filtered inventory as CSV. Its mode, quantity and cost columns are the ones the import reads, with
// the stock on record in them, so the file can be edited and imported again as it is.
import { toCsv } from '@/application/documents/csv';
import { CURRENCIES } from '@/domain/shared/currency';
import { majorTextFromMinor } from '@/domain/shared/money';
import { csvResponse } from '@/http/csv-response';
import { inventoryFilterFrom } from '@/http/admin-inventory-page';
import { EXPORT_ROW_LIMIT } from '@/http/admin-lists';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    const app = context.locals.app;
    const admin = requireAdmin(context.locals.admin);
    const [general, inventory] = await Promise.all([
      app.settings.get('general'),
      app.settings.get('inventory'),
    ]);
    const exponent = CURRENCIES[general.currency].exponent;
    const filter = inventoryFilterFrom(
      context.url.searchParams,
      admin.locale,
      inventory.defaultLowStockThreshold,
      EXPORT_ROW_LIMIT,
    );
    // The link carries the page of the screen it came from; a file always starts at the first row of the filter.
    const result = await app.inventory.queries.listRows({ ...filter, page: 1, trackedOnly: true });
    // Untracked variants have no stock to count, so the query leaves them out of the sheet.
    const rows = result.items.map((row) => [
      row.sku,
      'set',
      row.stock,
      row.costMinor === null ? null : majorTextFromMinor(row.costMinor, exponent),
      null,
      row.productName,
      row.variantLabel,
      row.barcode,
    ]);
    const header = ['sku', 'mode', 'quantity', 'cost', 'note', 'product', 'variant', 'barcode'];
    return csvResponse(toCsv(header, rows), 'stock.csv');
  },
});
