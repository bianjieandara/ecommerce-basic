// Input of one testimonial, as the admin list sends it. The same limits hold in the database and in the form.
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';

/** Saving a testimonial. Without an id it is a new one; with an id it updates that testimonial. */
export const testimonialInput = z.object({
  id: z.string().min(1).max(64).optional(),
  authorName: z.string().trim().min(1).max(80),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(1000),
  locale: z.enum(SUPPORTED_LOCALES),
  isVisible: z.boolean(),
  position: z.number().int().min(0).max(999),
});

/** A testimonial as the admin saves it. */
export type TestimonialInput = z.infer<typeof testimonialInput>;
