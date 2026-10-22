// Input of the email editor endpoints, and the lookup of an email key from a URL. Length limits come from the template engine,
// so the editor and the use case agree on how long a subject or a body may be.
import { z } from 'zod';
import { DomainError } from '@/domain/shared/errors';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';
import type { NotificationKey } from '../ports/notifications';
import { EMAIL_DEFINITIONS } from './email';
import { MAX_BODY_CHARS, MAX_SUBJECT_CHARS } from './template-engine';

/** One subject line. Trimmed, because the email renders it on one line anyway. */
const subjectText = z.string().trim().min(1).max(MAX_SUBJECT_CHARS);
/** One Markdown body. Not trimmed: spacing inside the copy is kept as typed. */
const bodyText = z.string().min(1).max(MAX_BODY_CHARS);

/** Saving an email: its copy in both languages and whether it is sent. */
export const saveEmailInput = z.object({
  subject: z.object({ es: subjectText, en: subjectText }),
  body: z.object({ es: bodyText, en: bodyText }),
  enabled: z.boolean(),
});

/** Previewing a draft in one language. */
export const previewEmailInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  subject: subjectText,
  body: bodyText,
});

/** A saved or edited email, as the endpoints receive it. */
export type SaveEmailInput = z.infer<typeof saveEmailInput>;

/**
 * Whether a URL segment names an email the store sends.
 * @param value Segment as received.
 * @returns True for a key with an email definition.
 */
export function isEmailKey(value: string): value is NotificationKey {
  return Object.hasOwn(EMAIL_DEFINITIONS, value);
}

/**
 * The notification key of a URL segment.
 * @param value Segment as received.
 * @returns The key.
 * @throws DomainError NOT_FOUND for a segment that names no email.
 */
export function emailKeyFrom(value: string): NotificationKey {
  if (!isEmailKey(value)) throw new DomainError('NOT_FOUND', 'Email not found');
  return value;
}
