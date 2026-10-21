// Contact form input. The honeypot field stays empty for people; a bot that fills it gets the same success answer, and
// nothing is stored.
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';

/** Contact form request body. */
export const contactMessageInput = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(30).default(''),
  message: z.string().trim().min(10).max(2000),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).nullable().default(null),
});

/** Parsed contact form request. */
export type ContactMessageInput = z.infer<typeof contactMessageInput>;
