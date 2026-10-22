// Timeline labels of an order. The customer's history and the admin timeline both read events here, so one event reads the same
// to the customer and to the owner.
import { isOrderEventType, statusOfEvent } from '@/domain/ordering/order-events';
import type { Locale } from '@/domain/shared/locale';
import { t } from '@/ui/i18n';

/**
 * The label of one timeline event. A status change reads as the state it moved to. A type without a label is shown as stored, so
 * a new event type never breaks a screen.
 * @param locale Language of the label.
 * @param type Event type as stored.
 * @returns The label.
 */
export function orderEventLabel(locale: Locale, type: string): string {
  const status = statusOfEvent(type);
  if (status) return t(locale, `order.statuses.${status}`);
  return isOrderEventType(type) ? t(locale, `order.events.${type}`) : type;
}
