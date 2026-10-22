// The page the builder edits. A system page the store has not saved yet is edited from its code default; its row is created by
// the first save, with the slug as its id, so each system slug keeps exactly one row.
import { isSystemPageSlug, type Page, type SystemPageSlug } from '@/domain/content/page';
import type { PageRepository } from '../ports/content';
import { defaultSystemPage } from './defaults/system-pages';

/**
 * The code default of a system page, as a page record whose id is the slug.
 * @param slug System page slug.
 * @param nowIso Time to stamp the record with.
 * @returns The page record.
 */
export function defaultPageRecord(slug: SystemPageSlug, nowIso: string): Page {
  const fallback = defaultSystemPage(slug);
  return {
    id: slug,
    slug,
    kind: 'system',
    title: fallback.title,
    seoTitle: {},
    seoDescription: {},
    sections: fallback.sections.map((section, index) => ({
      id: `${slug}-${index}`,
      type: section.type,
      enabled: section.enabled,
      config: section.config,
    })),
    isPublished: true,
    updatedAt: nowIso,
  };
}

/**
 * Finds a page for the builder: the saved row by id, then the saved row of a system slug, then the code default.
 * @param pages Page repository.
 * @param id Page id from the URL, or a system slug.
 * @param nowIso Time for a default record.
 * @returns The page, or null when the id names neither a saved page nor a system page.
 */
export async function findEditablePage(
  pages: PageRepository,
  id: string,
  nowIso: string,
): Promise<Page | null> {
  const saved = await pages.findById(id);
  if (saved) return saved;
  if (!isSystemPageSlug(id)) return null;
  return (await pages.findBySlug(id)) ?? defaultPageRecord(id, nowIso);
}
