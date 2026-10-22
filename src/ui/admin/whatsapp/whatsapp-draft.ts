// Editing state of one WhatsApp card: the form values, which are exactly the save endpoint's input. Pure functions, so the island
// and the server share one definition of what a saved template contains.
import type { SaveWhatsAppInput } from '@/application/notifications/whatsapp/whatsapp-schemas';
import type { WhatsAppTemplateConfig } from '@/application/ports/whatsapp';
import type { WhatsAppLink, WhatsAppVariable } from '@/application/notifications/whatsapp/definition';

/** Values of one card's form. The same shape as the save endpoint takes. */
export type WhatsAppDraft = SaveWhatsAppInput;

/**
 * The form values a stored config starts with. The stored mapping was validated when it was saved, so the cast is safe.
 * @param config Stored config.
 * @returns Draft values.
 */
export function draftOf(config: WhatsAppTemplateConfig): WhatsAppDraft {
  return {
    metaName: config.metaName,
    body: { es: config.body.es, en: config.body.en },
    params: config.params as WhatsAppVariable[],
    buttonPath: config.buttonPath as WhatsAppLink | null,
    enabled: config.enabled,
  };
}
