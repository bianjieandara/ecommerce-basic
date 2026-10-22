// Shape of one WhatsApp message: the bilingual body, the context variables it fills, and the optional link button and PDF
// header. The variable lists are closed, so the admin mapping, the zod schemas and the definitions agree on the same names.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { WhatsAppKey } from '../../ports/whatsapp';

/** Context values a WhatsApp template may fill. Each one is a NotificationContext path. */
export const WHATSAPP_VARIABLES = [
  'customer.firstName',
  'customer.fullName',
  'order.number',
  'order.total',
  'order.trackingCode',
  'invoice.number',
  'product.name',
  'product.variant',
  'stock.count',
  'store.name',
  'report.period',
] as const;

/** One variable a template may fill. */
export type WhatsAppVariable = (typeof WHATSAPP_VARIABLES)[number];

/** Context links a URL button may point at. The button sends only the part after the site's domain. */
export const WHATSAPP_LINKS = ['order.url', 'invoice.url', 'product.url', 'report.url'] as const;

/** One link a URL button may use. */
export type WhatsAppLink = (typeof WHATSAPP_LINKS)[number];

/** One WhatsApp message: who gets it and what its template contains by default. */
export interface WhatsAppDefinition {
  key: WhatsAppKey;
  audience: 'customer' | 'store';
  /** Variables for {{1}}, {{2}}, ... in this order. */
  params: readonly WhatsAppVariable[];
  /** Link of the URL button, or null. */
  buttonPath: WhatsAppLink | null;
  /** Whether the message carries the invoice PDF as a document header. */
  headerDocument: boolean;
  /** Default body per language. Meta rejects a body that starts or ends with a variable, so each one ends in text. */
  body: LocalizedText;
  /** Default button label per language, or null when there is no button. */
  buttonLabel: LocalizedText | null;
}
