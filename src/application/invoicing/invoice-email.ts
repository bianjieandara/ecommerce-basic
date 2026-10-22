// The invoice email. The stored PDF is attached when the store sends PDFs by e-mail, and the reference decides whether the message is
// new: the first send uses the invoice id, and a resend uses a reference of its own.
import { formatInvoiceNumber } from '@/domain/invoicing/invoice';
import type { NotificationService } from '../notifications/notification-service';
import type { Order } from '../dto/order-dto';
import type { SettingsRepository } from '../ports/content';
import type { Invoice } from '../ports/invoicing';
import type { OrderLinks } from '../ordering/order-links';
import { loadOrderPresentation, orderSections } from '../ordering/order-sections';

/** Dependencies of the invoice email. */
export interface InvoiceEmailDeps {
  notifications: NotificationService;
  settings: SettingsRepository;
  links: OrderLinks;
  siteUrl: string;
}

/**
 * Queues the invoice email for the customer.
 * @param deps Notifications, settings, links and the site address.
 * @param order The order the invoice belongs to.
 * @param invoice The issued invoice.
 * @param reference Makes this message distinct; the same reference is never queued twice.
 */
export async function queueInvoiceEmail(
  deps: InvoiceEmailDeps,
  order: Order,
  invoice: Invoice,
  reference: string,
): Promise<void> {
  const invoicing = await deps.settings.get('invoicing');
  await deps.notifications.notify({
    key: 'invoice_issued',
    reference,
    orderId: order.id,
    recipient: {
      email: order.customer.email,
      locale: order.locale,
      phone: order.customer.phone,
      whatsappOptIn: order.customer.whatsappOptIn,
    },
    context: {
      ...orderSections(order, order.locale, {
        siteUrl: deps.siteUrl,
        presentation: await loadOrderPresentation(deps.settings),
        accessKey: await deps.links.keyFor(order),
      }),
      invoice: { number: formatInvoiceNumber(invoice.series, invoice.number), url: '' },
    },
    attachments: invoicing.attachPdf ? [{ kind: 'invoice_pdf', invoiceId: invoice.id }] : [],
  });
}
