// Shape of one notification email. Every NotificationKey has exactly one definition, in customer-emails.ts,
// store-emails.ts or admin-emails.ts. email/index.ts fails to compile when one is missing.
import type { BlockName } from '../../documents/blocks';
import type { Locale } from '@/domain/shared/locale';
import type { NotificationKey } from '../../ports/notifications';
import type { EmailCopy } from '../render-email';

/** Who an email is for. Shown in the admin list. */
export type EmailAudience = 'customer' | 'store' | 'admin';

/** Variables every email may use: the store section. */
export const GLOBAL_EMAIL_VARIABLES = ['store.name', 'store.url', 'store.contactEmail'] as const;

/** One notification email: what it is, what its copy may use and its default copy in each language. */
export interface EmailDefinition {
  key: NotificationKey;
  audience: EmailAudience;
  /** English name shown in the admin list. */
  label: string;
  /** One line on when the email is sent. */
  description: string;
  /** Variables the copy may use, besides GLOBAL_EMAIL_VARIABLES. */
  variables: readonly string[];
  /** Blocks the copy may insert with {{block:name}}. */
  blocks: readonly BlockName[];
  /** Default copy per language. */
  defaults: Record<Locale, EmailCopy>;
}
