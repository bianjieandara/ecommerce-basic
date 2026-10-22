// Admin identity inputs. Passwords are at least 12 characters: the store is run by people who can lose access, and short
// passwords are the usual way in.
import { z } from 'zod';
import { ROLES } from '@/domain/identity/role';
import { SUPPORTED_LOCALES } from '@/domain/shared/locale';

const roleInput = z.enum(ROLES);

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
  role: roleInput,
  locale: z.enum(SUPPORTED_LOCALES).default('es'),
});

/** A change to one admin account (owners only). At least one of the two fields must be given. */
export const manageUserInput = z
  .object({ role: roleInput.optional(), isActive: z.boolean().optional() })
  .refine((value) => value.role !== undefined || value.isActive !== undefined, {
    message: 'Give a role or an active flag',
  });
