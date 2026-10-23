// Widget types and shapes: the identifiers of the blocks shipped with the template, and what a definition and an instance hold.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { FieldDescriptor } from '../../forms/field-descriptor';

/** The widget types shipped with the template. */
export const CORE_WIDGET_TYPES = [
  'hero_carousel',
  'featured_products',
  'category_grid',
  'promo_banner',
  'rich_text',
  'testimonials',
  'image_gallery',
  'faq',
  'whatsapp_cta',
  'trust_badges',
  'summary',
  'callout',
] as const;

/** One widget type identifier. */
export type WidgetType = (typeof CORE_WIDGET_TYPES)[number];

/** A block that admins can add to a page. */
export interface WidgetDefinition {
  type: string;
  label: LocalizedText;
  icon: string;
  fields: FieldDescriptor[];
  defaults: Record<string, unknown>;
}

/** Widget instance stored in a page's sections list. */
export interface WidgetInstance {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
