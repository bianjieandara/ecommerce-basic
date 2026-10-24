// Tailwind class strings shared by the admin screens, so every field and button looks the same everywhere.
export const FIELD =
  'rounded-brand border-text/15 min-h-12 w-full border bg-background px-3 transition-colors hover:border-text/40 focus:border-text';
export const LABEL = 'flex flex-col gap-1 text-sm';
export const BUTTON =
  'rounded-brand border-text/20 inline-flex min-h-11 min-w-11 items-center justify-center border px-4 text-sm font-semibold transition-colors hover:border-text disabled:opacity-50';
export const BUTTON_PRIMARY =
  'rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center px-5 font-semibold transition hover:opacity-90 disabled:opacity-50';
export const LINK_BUTTON =
  'inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-sm font-semibold underline';
export const ERROR_TEXT = 'text-accent text-sm';
/** A bordered white card, the surface of the redesigned admin (the Astro twin is AdminCard.astro). */
export const CARD = 'rounded-card border border-text/10 bg-background';
export const PANEL = 'rounded-card border border-text/10 bg-background flex flex-col gap-4 p-5';
/** Heading of a panel or a section on an admin screen. */
export const HEADING = 'text-base font-semibold';
/** A definition list: labels in one column, values in the other. */
export const DETAIL_LIST = 'grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm';
/** Card around an admin table. */
export const TABLE_WRAP = 'rounded-card border border-text/10 bg-background overflow-hidden';
/** Base classes of a status badge; a tone from BADGE_TONE is added to them. */
export const BADGE = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold';
/** Colour per badge tone. */
export const BADGE_TONE = {
  ok: 'bg-primary/15 text-text',
  warn: 'bg-accent/15 text-text',
  muted: 'bg-text/10 text-text/75',
} as const;
/** Square +/- buttons: 44px touch targets. */
export const STEP_BUTTON =
  'rounded-brand border-text/20 inline-flex size-11 items-center justify-center border text-lg font-semibold disabled:opacity-50';
