// Everything the admin shows about one order, loaded once: the order, its timeline, the messages sent for it, its invoice, the
// states the owner may still set and the customer's links. The order page and the order list's side pane share it, so the two
// never disagree. Reads only; every change goes through an endpoint.
import type { Container } from '@/composition/create-container';
import { canTransition, isPaidOrLater, MANUAL_ORDER_TARGETS } from '@/domain/ordering/order-status';
import { PATHS } from '@/domain/shared/paths';

/**
 * Loads the admin view of an order.
 * @param app Request container.
 * @param orderNumber The order's public number.
 * @returns The order and what goes with it, or null when there is no such order.
 */
export async function loadAdminOrderView(app: Container, orderNumber: number) {
  if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) return null;
  const order = await app.adminOps.reads.orderRecords.findByNumber(orderNumber);
  if (!order) return null;
  const [events, messages, invoice, invoicing, accessKey] = await Promise.all([
    app.adminOps.reads.orderRecords.listEvents(order.id),
    app.adminOps.reads.notificationLog.listForOrder(order.id, 20),
    app.adminOps.reads.invoiceRecords.findByOrderId(order.id),
    app.settings.get('invoicing'),
    app.adminOps.reads.orderLinks.keyFor(order),
  ]);
  // The customer's order link carries the key the order page accepts; the owner copies it into a chat. The PDF download uses
  // the same key, through the customer's PDF address.
  const customerLink = accessKey
    ? `${app.config.siteUrl}${PATHS.order(order.locale, order.number)}?key=${encodeURIComponent(accessKey)}`
    : null;
  return {
    order,
    // The timeline is stored oldest first; the screen shows the newest change first.
    timeline: [...events].reverse(),
    messages,
    invoice,
    // The issue action is offered for a paid order with no invoice, while the store's invoicing is on.
    canIssue: !invoice && isPaidOrLater(order.status) && invoicing.enabled,
    customerLink,
    pdfHref:
      accessKey && invoice
        ? `/api/orders/${order.number}/invoice.pdf?key=${encodeURIComponent(accessKey)}`
        : null,
    // The states the owner may still set from here.
    targets: MANUAL_ORDER_TARGETS.filter((to) => canTransition(order.status, to)),
  };
}

/** What {@link loadAdminOrderView} returns for an order that exists. */
export type AdminOrderView = NonNullable<Awaited<ReturnType<typeof loadAdminOrderView>>>;
