// Decides whether a WhatsApp message goes to a recipient, and to which number. Customers get messages only after they opted in;
// store alerts go to the alerts number in settings. Numbers are digits with the country code, as Meta expects.
import { normalizePhone } from '@/domain/shared/phone';
import type { SettingsMap } from '../content/settings-schemas';
import type { NotificationKey } from '../ports/notifications';
import { WHATSAPP_KEYS, type WhatsAppKey } from '../ports/whatsapp';
import { WHATSAPP_DEFINITIONS, type WhatsAppDefinition } from './whatsapp';

/** The whatsapp settings group, as the notification service reads it. */
export type WhatsAppSettings = SettingsMap['whatsapp'];

/**
 * Recipient fields the WhatsApp rule reads. Callers that do not pass them keep the email-only behaviour.
 * `phone` is as typed or stored; it is normalized with the country code from settings.
 * `whatsappOptIn` is the customer's choice at checkout or on a stock alert. Customer messages need it; the phone alone is not enough.
 */
export interface WhatsAppRecipient {
  phone?: string;
  whatsappOptIn?: boolean;
}

/**
 * The WhatsApp definition of a notification key.
 * @param key Notification key.
 * @returns The definition, or null for keys that are email only.
 */
export function whatsappDefinitionOf(key: NotificationKey): WhatsAppDefinition | null {
  const isWhatsAppKey = (WHATSAPP_KEYS as readonly string[]).includes(key);
  return isWhatsAppKey ? WHATSAPP_DEFINITIONS[key as WhatsAppKey] : null;
}

/**
 * The number a WhatsApp message goes to, or null when it must not be sent.
 * @param definition Definition of the message.
 * @param recipient Recipient's phone and opt-in. Store alerts ignore both.
 * @param whatsapp WhatsApp settings (alerts number and default country code).
 * @returns Digits with the country code, or null when there is no usable number or the customer did not opt in.
 */
export function whatsappNumberFor(
  definition: WhatsAppDefinition,
  recipient: WhatsAppRecipient,
  whatsapp: WhatsAppSettings,
): string | null {
  if (definition.audience === 'store') {
    return normalizePhone(whatsapp.alertsNumber, whatsapp.defaultCountryCode);
  }
  // Marketing and order messages to a customer need an explicit opt-in: the phone alone is never enough.
  if (recipient.whatsappOptIn !== true || !recipient.phone) return null;
  return normalizePhone(recipient.phone, whatsapp.defaultCountryCode);
}
