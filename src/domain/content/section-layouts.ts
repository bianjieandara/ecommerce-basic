// Layout variants a home section can take. A store picks one in the page builder, so two stores built from this template
// do not have to look alike. The page builder derives its choices and its validation from these lists, and the renderers
// in src/ui/widgets switch on the values.

/** How the hero draws a slide. */
export const HERO_LAYOUTS = [
  /** The picture in a rounded card inside the page's column, with the text over a dark gradient. */
  'contained',
  /** The picture from edge to edge of the window, with the text over a dark gradient. */
  'bleed',
  /** The picture plain, with the text in a solid block resting on its lower corner. */
  'scene',
  /** No overlay: the title sits above the picture and the picture is a quiet band below it. */
  'editorial',
] as const;

/** One hero layout. */
export type HeroLayout = (typeof HERO_LAYOUTS)[number];

/** The hero layout used when a slide set says nothing. */
export const DEFAULT_HERO_LAYOUT: HeroLayout = 'contained';

/** How a block of products arranges them. */
export const PRODUCT_LAYOUTS = [
  /** A row that scrolls sideways. */
  'carousel',
  /** A grid of cards: tinted tile, badges and the price on the picture. */
  'grid',
  /** A grid with wide margins, a plain tile and a small caption under it. */
  'gallery',
  /** A grid with no gaps: the pictures touch, and the name and price sit on the picture. */
  'flush',
  /** A compact list: a small picture beside the name and the price. */
  'list',
] as const;

/** One product layout. */
export type ProductLayout = (typeof PRODUCT_LAYOUTS)[number];

/** The product layout used when a block says nothing. */
export const DEFAULT_PRODUCT_LAYOUT: ProductLayout = 'carousel';

/** How a block of categories shows them. */
export const CATEGORY_LAYOUTS = [
  /** Rounded picture tiles with the name on the picture and an arrow in the corner. */
  'tiles',
  /** The same pictures with square corners, touching each other and reaching both edges of the window. */
  'flush',
  /** No pictures at all: the categories read as a row of type under a rule. */
  'links',
] as const;

/** One category layout. */
export type CategoryLayout = (typeof CATEGORY_LAYOUTS)[number];

/** The category layout used when a block says nothing. */
export const DEFAULT_CATEGORY_LAYOUT: CategoryLayout = 'tiles';

/** How the benefits row is drawn. */
export const BADGE_LAYOUTS = [
  /** An icon and a short text per benefit, in a divided row. */
  'icons',
  /** One quiet line of text, the benefits separated by middots and no icons at all. */
  'line',
] as const;

/** One benefits layout. */
export type BadgeLayout = (typeof BADGE_LAYOUTS)[number];

/** The benefits layout used when a block says nothing. */
export const DEFAULT_BADGE_LAYOUT: BadgeLayout = 'icons';

/** How customer quotes are drawn. */
export const TESTIMONIAL_LAYOUTS = [
  /** A card per quote, with its star rating. */
  'cards',
  /** No cards and no stars: the quotes are set as type, parted by hairlines. */
  'quiet',
] as const;

/** One testimonials layout. */
export type TestimonialLayout = (typeof TESTIMONIAL_LAYOUTS)[number];

/** The testimonials layout used when a block says nothing. */
export const DEFAULT_TESTIMONIAL_LAYOUT: TestimonialLayout = 'cards';

/** How a promotion is drawn. */
export const PROMO_LAYOUTS = [
  /** A rounded card: the picture darkened under the headline and the button. */
  'card',
  /** The same band with square corners, reaching both edges of the window. */
  'bleed',
  /** No picture and no fill: the offer is a headline and a link between two rules. */
  'plain',
] as const;

/** One promotion layout. */
export type PromoLayout = (typeof PROMO_LAYOUTS)[number];

/** The promotion layout used when a block says nothing. */
export const DEFAULT_PROMO_LAYOUT: PromoLayout = 'card';

/** How the WhatsApp block is drawn. */
export const CTA_LAYOUTS = [
  /** A filled band with a pill button. */
  'card',
  /** A line under a rule: the question on the left, a text link on the right. */
  'line',
] as const;

/** One call-to-action layout. */
export type CtaLayout = (typeof CTA_LAYOUTS)[number];

/** The call-to-action layout used when a block says nothing. */
export const DEFAULT_CTA_LAYOUT: CtaLayout = 'card';

/**
 * Narrows a stored value to a hero layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid hero layout.
 */
export function heroLayoutOf(value: unknown): HeroLayout {
  return (HERO_LAYOUTS as readonly unknown[]).includes(value) ? (value as HeroLayout) : DEFAULT_HERO_LAYOUT;
}

/**
 * Narrows a stored value to a promotion layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid promotion layout.
 */
export function promoLayoutOf(value: unknown): PromoLayout {
  return (PROMO_LAYOUTS as readonly unknown[]).includes(value)
    ? (value as PromoLayout)
    : DEFAULT_PROMO_LAYOUT;
}

/**
 * Narrows a stored value to a call-to-action layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid call-to-action layout.
 */
export function ctaLayoutOf(value: unknown): CtaLayout {
  return (CTA_LAYOUTS as readonly unknown[]).includes(value) ? (value as CtaLayout) : DEFAULT_CTA_LAYOUT;
}

/**
 * Narrows a stored value to a benefits layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid benefits layout.
 */
export function badgeLayoutOf(value: unknown): BadgeLayout {
  return (BADGE_LAYOUTS as readonly unknown[]).includes(value)
    ? (value as BadgeLayout)
    : DEFAULT_BADGE_LAYOUT;
}

/**
 * Narrows a stored value to a testimonials layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid testimonials layout.
 */
export function testimonialLayoutOf(value: unknown): TestimonialLayout {
  return (TESTIMONIAL_LAYOUTS as readonly unknown[]).includes(value)
    ? (value as TestimonialLayout)
    : DEFAULT_TESTIMONIAL_LAYOUT;
}

/**
 * Narrows a stored value to a category layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid category layout.
 */
export function categoryLayoutOf(value: unknown): CategoryLayout {
  return (CATEGORY_LAYOUTS as readonly unknown[]).includes(value)
    ? (value as CategoryLayout)
    : DEFAULT_CATEGORY_LAYOUT;
}

/**
 * Narrows a stored value to a product layout, falling back when a page holds an older or unknown value.
 * @param value Value read from a section's config.
 * @returns A valid product layout.
 */
export function productLayoutOf(value: unknown): ProductLayout {
  return (PRODUCT_LAYOUTS as readonly unknown[]).includes(value)
    ? (value as ProductLayout)
    : DEFAULT_PRODUCT_LAYOUT;
}
