// Input of the translate endpoint. The limit keeps one call small and cheap; the UI checks the same limit before it sends.
import '@/application/zod-config';
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';

/** Longest text one translation call accepts, in characters. */
export const MAX_TRANSLATE_CHARS = 5000;

/** A translation request. Source and target must differ, otherwise the call is a copy. */
export const translateInput = z
  .object({
    text: z.string().trim().min(1).max(MAX_TRANSLATE_CHARS),
    from: z.enum(SUPPORTED_LOCALES),
    to: z.enum(SUPPORTED_LOCALES),
  })
  .refine((input) => input.from !== input.to, { path: ['to'], message: 'same_language' });

/** A translation request as the endpoint receives it. */
export type TranslateInput = z.infer<typeof translateInput>;
