// Class strings of the storefront search field, shared by the shop page (an Astro component) and the header search dialog
// (a Preact island), so the two look the same. The field is a bordered pill with the icon inside on the left and one round
// button inside on the right.

/** Wrapper of the field: the icon and the button are positioned against it. */
export const SEARCH_FIELD_CLASS = 'relative';

/** The text input. Room is left for the icon (left) and the round button (right). */
export const SEARCH_INPUT_CLASS =
  'min-h-14 w-full appearance-none rounded-full border border-text/15 bg-background pr-16 pl-12 text-base transition-colors hover:border-text/40 focus:border-text [&::-webkit-search-cancel-button]:appearance-none';

/** The magnifier inside the field. */
export const SEARCH_ICON_CLASS = 'pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-text/50';

/** Shape of the round button inside the field; the caller adds its colours. */
export const SEARCH_BUTTON_CLASS =
  'absolute top-1/2 right-1.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full transition';
