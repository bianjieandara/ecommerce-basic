// Customer order messages: one function builds the order sections and queues the email, so every status message carries the same
// order link and store details. The link uses the email key, which the server can rebuild from the stored hash.
import type { Order } from '../dto/order-dto';
import type { NotificationService } from '../notifications/notification-service';
import type { SettingsRepository } from '../ports/content';
import type { NotificationKey } from '../ports/notifications';
import type { OrderLinks } from './order-links';
import { loadOrderPresentation, orderSections } from './order-sections';

/** Dependencies of the customer order messages. */
export interface CustomerNoticeDeps {
  notifications: NotificationService;
  settings: SettingsRepository;
  links: OrderLinks;
  siteUrl: string;
}

/**
 * Queues one order message to the customer.
 * @param deps Notifications, store settings, links and the site address.
 * @param order Order as it is after the change: its status and tracking code go into the message.
 * @param key Message to send.
 */
export async function notifyOrderCustomer(
  deps: CustomerNoticeDeps,
  order: Order,
  key: NotificationKey,
): Promise<void> {
  await deps.notifications.notify({
    key,
    reference: order.id,
    orderId: order.id,
    recipient: { email: order.customer.email, locale: order.locale },
    context: orderSections(order, order.locale, {
      siteUrl: deps.siteUrl,
      presentation: await loadOrderPresentation(deps.settings),
      accessKey: await deps.links.keyFor(order),
    }),
  });
}
