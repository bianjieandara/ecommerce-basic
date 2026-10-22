// WhatsApp message definitions: one per key, merged here. The seed rows of whatsapp_templates come from these defaults, and the
// admin editor starts from them until a row is saved.
import type { WhatsAppKey, WhatsAppTemplateConfig } from '../../ports/whatsapp';
import type { WhatsAppDefinition } from './definition';
import { CUSTOMER_WHATSAPP } from './customer-whatsapp';
import { STORE_WHATSAPP } from './store-whatsapp';

export type { WhatsAppDefinition, WhatsAppLink, WhatsAppVariable } from './definition';
export { WHATSAPP_LINKS, WHATSAPP_VARIABLES } from './definition';

/** Every WhatsApp message, by key. The type checker fails when one is missing. */
export const WHATSAPP_DEFINITIONS: Record<WhatsAppKey, WhatsAppDefinition> = {
  ...CUSTOMER_WHATSAPP,
  ...STORE_WHATSAPP,
};

/**
 * The config a key starts with: disabled, with the default body and mapping and a Meta name built from the key.
 * Disabled matters: a template that was never submitted and approved must not be sent.
 * @param definition Definition of the key.
 * @param nowIso Time the row is seeded.
 * @returns A config ready to store.
 */
export function defaultConfigOf(definition: WhatsAppDefinition, nowIso: string): WhatsAppTemplateConfig {
  return {
    key: definition.key,
    // Meta accepts lowercase letters, digits and underscores only, and the name must stay the same across languages.
    metaName: `store_${definition.key}`,
    enabled: false,
    body: { ...definition.body },
    params: [...definition.params],
    buttonPath: definition.buttonPath,
    headerDocument: definition.headerDocument,
    remoteStatus: {},
    updatedAt: nowIso,
  };
}
