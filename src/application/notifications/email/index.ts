// Notification email definitions. Every NotificationKey has exactly one; the type checker fails when one is missing.
import type { NotificationKey } from '../../ports/notifications';
import type { TemplateRules } from '../template-engine';
import { ADMIN_EMAILS } from './admin-emails';
import { CUSTOMER_EMAILS } from './customer-emails';
import { GLOBAL_EMAIL_VARIABLES, type EmailDefinition } from './definition';
import { ORDER_EMAILS } from './order-emails';
import { STORE_EMAILS } from './store-emails';

/** Every notification email, by key. */
export const EMAIL_DEFINITIONS: Record<NotificationKey, EmailDefinition> = {
  ...ORDER_EMAILS,
  ...CUSTOMER_EMAILS,
  ...STORE_EMAILS,
  ...ADMIN_EMAILS,
};

/**
 * Variables and blocks one email's copy may use: the store variables plus the email's own list.
 * @param definition Email definition.
 * @returns Rules for validateTemplate.
 */
export function rulesFor(definition: EmailDefinition): TemplateRules {
  return { variables: [...GLOBAL_EMAIL_VARIABLES, ...definition.variables], blocks: definition.blocks };
}
