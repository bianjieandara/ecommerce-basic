// Input schemas of the WhatsApp admin endpoints and of the notify.whatsapp job, plus the URL-segment lookup of a key.
// The editor and the use case read the same limits, so a body the editor accepts is one the use case accepts.
import { z } from 'zod';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import { WHATSAPP_KEYS, type WhatsAppKey } from '../../ports/whatsapp';
import type { EmailAttachmentRef } from '../../ports/notifications';
import type { NotificationContext } from '../context';
import { WHATSAPP_LINKS, WHATSAPP_VARIABLES } from './definition';

/** Parameters a template may map. Meta allows at most ten body variables in this store. */
const MAX_PARAMS = 10;

/** Saving a template: its Meta name, body per language, parameter mapping, button, header and whether it is sent. */
export const saveWhatsAppInput = z.object({
  metaName: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'Lowercase letters, digits and underscores only'),
  body: z.object({
    es: z.string().max(1024),
    en: z.string().max(1024),
  }),
  params: z.array(z.enum(WHATSAPP_VARIABLES)).max(MAX_PARAMS),
  buttonPath: z.enum(WHATSAPP_LINKS).nullable(),
  enabled: z.boolean(),
});

/** A saved template, as the admin endpoints receive it. */
export type SaveWhatsAppInput = z.infer<typeof saveWhatsAppInput>;

/**
 * Payload of notify.whatsapp: one queued message. The phone is digits with the country code. The context is built by the
 * notification service; attachments are references, and the PDF is read when the message is sent.
 */
export const notifyWhatsappPayload = z.object({
  idempotencyKey: z.string().min(1).max(300),
  key: z.enum(WHATSAPP_KEYS),
  locale: z.enum(SUPPORTED_LOCALES),
  to: z.string().max(32),
  context: z.custom<NotificationContext>((value) => typeof value === 'object' && value !== null),
  attachments: z
    .array(z.custom<EmailAttachmentRef>((value) => typeof value === 'object' && value !== null))
    .default([]),
});

/** Parsed payload of notify.whatsapp. */
export type NotifyWhatsappPayload = z.infer<typeof notifyWhatsappPayload>;

/**
 * The WhatsApp key of a URL segment.
 * @param value Segment as received.
 * @returns The key.
 * @throws DomainError NOT_FOUND for a segment that names no WhatsApp message.
 */
export function whatsappKeyFrom(value: string): WhatsAppKey {
  const found = (WHATSAPP_KEYS as readonly string[]).includes(value);
  if (!found) throw new DomainError('NOT_FOUND', 'WhatsApp message not found');
  return value as WhatsAppKey;
}
