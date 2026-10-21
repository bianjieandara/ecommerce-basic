// Pages and their identity. System pages exist in every store and cannot be deleted; custom pages can.
import type { LocalizedText } from '../shared/localized-text';

/** Slugs of the system pages every store has. They are created by setup from code defaults. */
export const SYSTEM_PAGE_SLUGS = [
  'home',
  'about',
  'contact',
  'privacy',
  'terms',
  'shipping-returns',
] as const;

/** One system page slug. */
export type SystemPageSlug = (typeof SYSTEM_PAGE_SLUGS)[number];

/** Whether a slug belongs to a system page. */
export function isSystemPageSlug(slug: string): slug is SystemPageSlug {
  return (SYSTEM_PAGE_SLUGS as readonly string[]).includes(slug);
}

/** A page as stored. Sections are widget instances, validated by the widget registry. */
export interface Page {
  id: string;
  slug: string;
  kind: 'system' | 'custom';
  title: LocalizedText;
  seoTitle: Partial<LocalizedText>;
  seoDescription: Partial<LocalizedText>;
  sections: { id: string; type: string; enabled: boolean; config: Record<string, unknown> }[];
  isPublished: boolean;
  updatedAt: string;
}
