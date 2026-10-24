// DemoOrderEmails: the e-mails the store wrote for one order, read back from the outbox. Demo mode only. Every call checks the
// order's access key first, so the messages are visible to the customer who holds the order link and to nobody else.
import type { OrderRepository } from '../ports/ordering';
import type { NotificationKey, NotificationLogRepository } from '../ports/notifications';
import type { MediaStorage } from '../ports/media';
import type { Hasher } from '../ports/platform';
import { accessKeyMatches } from '../ordering/access-key';
import { outboxKey } from '../notifications/outbox';

/** One e-mail of an order, as the order page lists it. */
export interface OrderEmailView {
  /** Message id, which the view link uses. */
  id: string;
  templateKey: NotificationKey;
  subject: string;
  sentAt: string;
}

/** Dependencies of DemoOrderEmails. */
export interface DemoOrderEmailsDeps {
  enabled: boolean;
  orders: OrderRepository;
  notificationLog: NotificationLogRepository;
  media: MediaStorage;
  hasher: Hasher;
}

/** Lists and shows the e-mails of an order in demo mode. */
export class DemoOrderEmails {
  /** @param deps Access checks, the notification log and the outbox. */
  constructor(private readonly deps: DemoOrderEmailsDeps) {}

  /**
   * The e-mails sent for an order, newest first.
   * @param number Order number from the link.
   * @param key Access key from the link.
   * @returns The e-mails, or null when demo mode is off or the key does not match the order.
   */
  async list(number: number, key: string): Promise<OrderEmailView[] | null> {
    const orderId = await this.authorize(number, key);
    if (!orderId) return null;
    const entries = await this.deps.notificationLog.listForOrder(orderId, 20);
    return entries
      .filter((entry) => entry.channel === 'email' && entry.providerMessageId)
      .map((entry) => ({
        id: entry.providerMessageId as string,
        templateKey: entry.templateKey,
        subject: entry.subject ?? '',
        sentAt: entry.createdAt,
      }));
  }

  /**
   * The HTML of one e-mail of an order.
   * @param number Order number from the link.
   * @param key Access key from the link.
   * @param messageId Message id from the list.
   * @returns The HTML, or null when the key is wrong, the message is not this order's, or it is no longer kept.
   */
  async html(number: number, key: string, messageId: string): Promise<string | null> {
    const orderId = await this.authorize(number, key);
    if (!orderId) return null;
    const entries = await this.deps.notificationLog.listForOrder(orderId, 20);
    if (!entries.some((entry) => entry.providerMessageId === messageId)) return null;
    const bytes = await this.deps.media.getBytes(outboxKey(messageId));
    if (!bytes) return null;
    const record = JSON.parse(new TextDecoder().decode(bytes)) as { html?: unknown };
    return typeof record.html === 'string' ? record.html : null;
  }

  /**
   * Checks the access key of an order.
   * @param number Order number.
   * @param key Access key.
   * @returns The order's id when demo mode is on and the key matches, otherwise null.
   */
  private async authorize(number: number, key: string): Promise<string | null> {
    if (!this.deps.enabled) return null;
    const found = await this.deps.orders.findAccessKeyHash(number);
    if (!found || !(await accessKeyMatches(this.deps.hasher, key, found.accessKeyHash))) return null;
    return found.id;
  }
}
