// Store values an invoice document shows, read from settings. The customer page uses this, and the stored PDF should too, so
// the two documents cannot show different store details.
import { pickText } from '@/domain/shared/localized-text';
import type { InvoiceDocumentOptions } from '../documents/invoice-document';
import type { SettingsRepository } from '../ports/content';
import type { Invoice } from '../ports/invoicing';

/**
 * Store values an invoice document shows: store name, country and time zone for the header, the accent color, and the
 * footer notes in the invoice's own language.
 * @param settings Settings repository. Each group is read once.
 * @param invoice The invoice being shown; its language picks the footer notes.
 * @returns The options for renderInvoiceHtml.
 */
export async function invoiceDocumentOptions(
  settings: SettingsRepository,
  invoice: Invoice,
): Promise<InvoiceDocumentOptions> {
  const [general, theme, invoicing] = await Promise.all([
    settings.get('general'),
    settings.get('theme'),
    settings.get('invoicing'),
  ]);
  return {
    storeName: general.storeName,
    country: general.country,
    timeZone: general.timezone,
    primaryColor: theme.colorPrimary,
    footerNotes: pickText(invoicing.footerNotes, invoice.locale, 'es'),
  };
}
