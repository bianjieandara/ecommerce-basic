// Renders one email from its copy and a context. Sending and previews both use this function, so the admin previews
// exactly what the queue sends.
import { EMAIL_BLOCKS } from '../documents/blocks';
import { renderEmailLayout } from '../documents/email-layout';
import { htmlToText } from '../documents/html-to-text';
import { DEFAULT_LOCALE, type Locale } from '@/domain/shared/locale';
import { pickText } from '@/domain/shared/localized-text';
import type { EmailTemplateOverride } from '../ports/notifications';
import type { NotificationContext } from './context';
import type { EmailDefinition } from './email/definition';
import { renderSubject, renderTemplate } from './template-engine';

/** Subject and Markdown body in one language. */
export interface EmailCopy {
  subject: string;
  body: string;
}

/** A ready-to-send email. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * Picks the copy to use: the admin override when there is one, otherwise the code default. A language missing from an
 * override falls back to the default language.
 * @param override Saved override, or null.
 * @param definition Code default of the email.
 * @param locale Recipient language.
 * @returns The copy to render.
 */
export function copyFor(
  override: EmailTemplateOverride | null,
  definition: EmailDefinition,
  locale: Locale,
): EmailCopy {
  if (!override) return definition.defaults[locale];
  return {
    subject: pickText(override.subject, locale, DEFAULT_LOCALE),
    body: pickText(override.body, locale, DEFAULT_LOCALE),
  };
}

/**
 * Renders the subject, HTML and plain-text versions of one email.
 * @param copy Subject and body templates.
 * @param context Values for the message.
 * @returns The rendered email.
 */
export function renderEmail(copy: EmailCopy, context: NotificationContext): RenderedEmail {
  const bodyHtml = renderTemplate(copy.body, context, EMAIL_BLOCKS);
  const text = htmlToText(bodyHtml);
  const html = renderEmailLayout({
    bodyHtml,
    preheader: text.slice(0, 120),
    storeName: context.store.name,
    logoUrl: null,
    primaryColor: context.store.primaryColor,
    footerText: context.store.name,
    contactEmail: context.store.contactEmail,
    locale: context.locale,
  });
  return { subject: renderSubject(copy.subject, context), html, text };
}
