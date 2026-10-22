// What the WhatsApp admin screen shows: the connection status (flags only, never the values), and per message its stored config,
// its default button label and whether its body is locked because Meta approved it.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { WhatsAppConnectionStatus, WhatsAppKey, WhatsAppTemplateConfig } from '../../ports/whatsapp';

/** One WhatsApp message on the admin screen. */
export interface WhatsAppTemplateEntry {
  key: WhatsAppKey;
  audience: 'customer' | 'store';
  /** Stored config, or the default while the message was never saved. */
  config: WhatsAppTemplateConfig;
  /** True while a language is approved: the body and mapping are then locked until a new Meta name is used. */
  readOnly: boolean;
  /** Label of the URL button in each language, or null when the message has no button. */
  buttonLabel: LocalizedText | null;
}

/** The whole screen: connection flags and every message. */
export interface WhatsAppOverview {
  connection: WhatsAppConnectionStatus;
  entries: WhatsAppTemplateEntry[];
}

/** Result of one submit: the outcome per language, with a code for the UI and Meta's message when there is one. */
export interface SubmitLanguageResult {
  locale: 'es' | 'en';
  outcome: 'submitted' | 'already_exists' | 'failed';
  /** BODY_INVALID for a body the store refuses to send, PROVIDER when Meta refused, otherwise null. */
  reason: 'BODY_INVALID' | 'PROVIDER' | null;
  /** Meta's message for a PROVIDER failure. */
  detail: string | null;
}

/**
 * Whether Meta approved the template in any language.
 * @param config Stored config.
 * @returns True when at least one language is approved.
 */
export function isApproved(config: Pick<WhatsAppTemplateConfig, 'remoteStatus'>): boolean {
  return Object.values(config.remoteStatus).some((language) => language?.status === 'APPROVED');
}
