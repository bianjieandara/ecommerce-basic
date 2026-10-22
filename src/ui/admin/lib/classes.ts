// Tailwind class strings shared by the admin screens, so every field and button looks the same everywhere.
export const FIELD = 'rounded-brand border-text/20 min-h-11 w-full border bg-white px-3';
export const LABEL = 'flex flex-col gap-1 text-sm';
export const BUTTON =
  'rounded-brand border-text/20 inline-flex min-h-11 items-center justify-center border px-4 text-sm font-semibold disabled:opacity-50';
export const BUTTON_PRIMARY =
  'rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center px-5 font-semibold disabled:opacity-50';
export const LINK_BUTTON = 'inline-flex min-h-11 items-center px-2 text-sm font-semibold underline';
export const ERROR_TEXT = 'text-accent text-sm';
export const PANEL = 'rounded-brand bg-surface flex flex-col gap-4 p-4';
/** Card around an admin table. */
export const TABLE_WRAP = 'rounded-brand bg-surface overflow-hidden';
/** Base classes of a status badge; a tone from BADGE_TONE is added to them. */
export const BADGE = 'rounded-brand inline-flex items-center px-2 py-0.5 text-xs font-semibold';
/** Colour per badge tone. */
export const BADGE_TONE = {
  ok: 'bg-primary/15 text-text',
  warn: 'bg-accent/15 text-text',
  muted: 'bg-text/10 text-text/75',
} as const;
/** Square +/- buttons: 44px touch targets. */
export const STEP_BUTTON =
  'rounded-brand border-text/20 inline-flex size-11 items-center justify-center border text-lg font-semibold disabled:opacity-50';
