// Ledger export: the movements that match the filters, newest first, as CSV.
import { toCsv } from '@/application/documents/csv';
import { csvResponse } from '@/http/csv-response';
import { EXPORT_ROW_LIMIT, movementFilterFrom } from '@/http/admin-inventory-page';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    const result = await context.locals.app.inventory.queries.listMovements(
      movementFilterFrom(context.url.searchParams, admin.locale, EXPORT_ROW_LIMIT),
    );
    const header = [
      'date',
      'sku',
      'product',
      'variant',
      'reason',
      'delta',
      'stock_after',
      'note',
      'actor',
      'reference',
    ];
    const rows = result.items.map((movement) => [
      movement.createdAt,
      movement.sku,
      movement.productName,
      movement.variantLabel,
      movement.reason,
      movement.delta,
      movement.stockAfter,
      movement.note,
      movement.actor,
      movement.reference,
    ]);
    return csvResponse(toCsv(header, rows), 'stock-movements.csv');
  },
});
