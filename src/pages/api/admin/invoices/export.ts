// Invoice list as CSV: the invoices the filters match, newest first. Amounts are in major units, so the file reads the same in a
// spreadsheet as on the screen.
import { toCsv } from '@/application/documents/csv';
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import { CURRENCIES } from '@/domain/shared/currency';
import { majorTextFromMinor } from '@/domain/shared/money';
import { invoiceFilterFrom } from '@/http/admin-invoice-page';
import { EXPORT_ROW_LIMIT } from '@/http/admin-lists';
import { csvResponse } from '@/http/csv-response';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    requireAdmin(context.locals.admin);
    const app = context.locals.app;
    const general = await app.settings.get('general');
    const filter = invoiceFilterFrom(context.url.searchParams, general.timezone);
    // A file always starts at the first row of the filter, whatever page the screen was on.
    const result = await app.adminOps.reads.invoices.list(filter, 1, EXPORT_ROW_LIMIT);
    const header = [
      'invoice',
      'order',
      'buyer',
      'issued_at',
      'currency',
      'total',
      'tax',
      'status',
      'void_reason',
    ];
    const rows = result.items.map((invoice) => {
      const exponent = CURRENCIES[invoice.currency].exponent;
      return [
        formatInvoiceNumber(invoice.series, invoice.number),
        invoice.orderNumber,
        invoice.buyerName,
        invoice.issuedAt,
        invoice.currency,
        majorTextFromMinor(invoice.totalMinor, exponent),
        majorTextFromMinor(invoice.taxMinor, exponent),
        invoice.status,
        invoice.voidReason,
      ];
    });
    return csvResponse(toCsv(header, rows), 'invoices.csv');
  },
});
