// Input of the page builder: the page's texts, its publication and its sections. A section's settings are checked against its
// widget's fields by the use case, because every widget has its own fields.
import '@/application/zod-config';
import { z } from 'zod';

/** Text in both languages, as the page builder sends it. */
const localizedInput = z.object({ es: z.string().trim().max(300), en: z.string().trim().max(300) });

/** One section of a page: a widget type with its settings. */
export const pageSectionInput = z.object({
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

/** Saving a page: its texts, its publication and its sections. The slug and the kind never change here. */
export const savePageInput = z.object({
  title: localizedInput,
  seoTitle: localizedInput,
  seoDescription: localizedInput,
  isPublished: z.boolean(),
  sections: z.array(pageSectionInput).max(40),
});

/** Creating a custom page. */
export const createPageInput = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .refine((value) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value), {
      message: 'Use lowercase letters, digits and dashes',
      params: { code: 'SLUG_FORMAT' },
    }),
  title: localizedInput.refine((value) => value.es !== '' || value.en !== '', {
    message: 'Required',
    params: { code: 'REQUIRED' },
  }),
});

/** A page as the page builder saves it. */
export type SavePageInput = z.infer<typeof savePageInput>;

/** A custom page as the admin creates it. */
export type CreatePageInput = z.infer<typeof createPageInput>;
