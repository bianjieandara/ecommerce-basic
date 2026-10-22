// Labels of the notification keys on the admin screens: the message log and the messages sent for an order. A key without a label is
// shown as it is stored, so a new key never leaves an empty cell.
import { NOTIFICATION_KEYS, type NotificationKey } from '@/application/ports/notifications';
import type { Locale } from '@/domain/shared/locale';
import { pickNamespace } from '@/ui/i18n';

/**
 * Whether a stored value is a notification key this version knows.
 * @param value Text as stored.
 * @returns True for a key in NOTIFICATION_KEYS.
 */
function isNotificationKey(value: string): value is NotificationKey {
  return (NOTIFICATION_KEYS as readonly string[]).includes(value);
}

/**
 * The label of a notification key in the language of the screen.
 * @param locale Language of the label.
 * @param key Key as stored.
 * @returns The label, or the key itself when it has none.
 */
export function notificationLabel(locale: Locale, key: string): string {
  const labels = pickNamespace(locale, 'admin').notifications.templates;
  return isNotificationKey(key) ? labels[key] : key;
}
