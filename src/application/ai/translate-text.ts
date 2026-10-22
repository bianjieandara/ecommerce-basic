// Translates one text for an editor. The result is returned to the screen and never saved here: the editor reviews it and saves the form.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { AdminUser } from '../ports/identity';
import type { TextTranslator } from '../ports/translator';
import { maskPlaceholders, restorePlaceholders } from './placeholders';
import type { TranslateInput } from './translate-schemas';

/** Dependencies of the translation use case. */
export interface TranslateTextDeps {
  translator: TextTranslator;
}

/** What the editor gets back. When `placeholdersKept` is false the text must not be applied. */
export interface TranslationResult {
  text: string;
  placeholdersKept: boolean;
}

/** Translates text for the admin editors, keeping template placeholders intact. */
export class TranslateText {
  /** @param deps The translator adapter. */
  constructor(private readonly deps: TranslateTextDeps) {}

  /**
   * Masks placeholders, translates the rest and restores the placeholders.
   * @param actor The signed-in admin.
   * @param input Text and languages, already validated by translateInput.
   * @returns The translation and whether every placeholder survived it.
   * @throws DomainError FORBIDDEN when the actor may not edit content.
   * @throws RetryableError when the translator does not answer (the endpoint maps it to a generic failure).
   */
  async execute(actor: AdminUser, input: TranslateInput): Promise<TranslationResult> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    const { masked, placeholders } = maskPlaceholders(input.text);
    const translated = await this.deps.translator.translate(masked, input.from, input.to);
    const restored = restorePlaceholders(translated, placeholders);
    return { text: restored ?? '', placeholdersKept: restored !== null };
  }
}
