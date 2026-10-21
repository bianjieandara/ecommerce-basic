// Admin identity inputs. Passwords are at least 12 characters: the store is run by people who can lose access, and short
// passwords are the usual way in.
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';

/** Shortest password accepted for an admin account. */
export const MIN_PASSWORD_LENGTH = 12;

const passwordInput = z.string().min(MIN_PASSWORD_LENGTH).max(200);

/** First owner setup: needs the SETUP_TOKEN secret, so only whoever deployed the store can create the owner. */
export const setupOwnerInput = z.object({
  setupToken: z.string().min(8).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  password: passwordInput,
  locale: z.enum(SUPPORTED_LOCALES).default('es'),
});

/** Login form. */
export const loginInput = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  turnstileToken: z.string().max(2048).nullable().default(null),
});

/** "Forgot my password" form. */
export const forgotPasswordInput = z.object({
  email: z.email().max(254),
  turnstileToken: z.string().max(2048).nullable().default(null),
});

/** Sets a new password with a reset or invitation token. */
export const resetPasswordInput = z.object({
  token: z.string().min(20).max(200),
  password: passwordInput,
});

/** Invitation of another admin (owners only). */
export const inviteAdminInput = z.object({
  email: z.email().max(254),
  name: z.string().trim().min(2).max(120),
  role: z.enum(['owner', 'editor']),
  locale: z.enum(SUPPORTED_LOCALES).default('es'),
});
