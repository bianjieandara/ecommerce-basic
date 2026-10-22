// Workers AI translator: the Cloudflare-hosted M2M100 model behind the AI binding. The binding is injected, so this file never imports the Worker env.
import { RetryableError } from '@/domain/shared/errors';
import type { Locale } from '@/domain/shared/locale';
import type { TextTranslator } from '@/application/ports/translator';

/**
 * Model used for translation: Cloudflare-hosted multilingual encoder-decoder (task: Translation). Its language codes
 * ('en', 'es') match the store's locales, so no mapping is needed.
 */
export const TRANSLATION_MODEL = '@cf/meta/m2m100-1.2b';

/** The one AI call this adapter makes. Structurally matches the `env.AI` binding for this model. */
export interface AiTranslationBinding {
  run(
    model: typeof TRANSLATION_MODEL,
    input: { text: string; source_lang: string; target_lang: string },
  ): Promise<unknown>;
}

/** The answer of the translation model in synchronous mode. */
interface TranslationOutput {
  translated_text?: unknown;
}

/** Translates text with Workers AI. */
export class WorkersAiTranslator implements TextTranslator {
  /** @param ai The AI binding from the Worker env (`env.AI`). */
  constructor(private readonly ai: AiTranslationBinding) {}

  /**
   * Translates one text.
   * @param text Text to translate, already masked and within the length limit.
   * @param from Language of the text.
   * @param to Language of the translation.
   * @returns The translated text.
   * @throws RetryableError when the model answers without a text.
   */
  async translate(text: string, from: Locale, to: Locale): Promise<string> {
    const output = (await this.ai.run(TRANSLATION_MODEL, {
      text,
      source_lang: from,
      target_lang: to,
    })) as TranslationOutput | null;
    if (typeof output?.translated_text !== 'string') {
      throw new RetryableError('Workers AI translation returned no text');
    }
    return output.translated_text;
  }
}
