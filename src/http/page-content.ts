// Page content for public pages: stored sections (or the code default) and the data each widget needs.
// Widgets never query data themselves; this module loads it once per page.
import type { Container } from '@/composition/create-container';
import type { WidgetInstance } from '@/application/content/widgets/registry';
import { DEFAULT_SYSTEM_PAGES } from '@/application/content/defaults/system-pages';
import type { CategoryDto, ProductCardDto } from '@/application/dto/catalog-dto';
import type { Testimonial } from '@/application/ports/content';
import { parseCatalogQuery, type CatalogOptions } from '@/domain/catalog/catalog-query';
import type { Locale } from '@/domain/shared/locale';
import { pickText } from '@/domain/shared/localized-text';

/** Title, search-engine text and sections of a page, ready to render. */
export interface PageContent {
  title: string;
  /** Title for search engines in the page language; empty when the owner wrote none. */
  seoTitle: string;
  /** Description for search engines in the page language; empty when the owner wrote none. */
  seoDescription: string;
  sections: WidgetInstance[];
}

/** A picture chosen in the admin for a section, with the sizes the storefront can serve. */
export interface SectionImage {
  width: number;
  height: number;
  /** Description for the page language; empty when none was written. */
  alt: string;
  variants: { width: number; key: string }[];
}

/** Data loaded for the widgets of one page, keyed by section id. */
export interface SectionData {
  productsBySection: Record<string, ProductCardDto[]>;
  categories: CategoryDto[];
  /** Pictures used by the sections (hero slides, banners, galleries), by media id. */
  media?: Record<string, SectionImage>;
  /**
   * Visible testimonials in the admin's order, shared by every testimonials section on the page.
   * Optional because a page with no stored or default content has no sections to load them for.
   */
  testimonials?: Testimonial[];
}

/** Largest number of products a featured block may show. */
const MAX_FEATURED = 24;

/**
 * Loads a page by slug: the stored version when published, otherwise the code default for system pages.
 * @param app Request container.
 * @param slug Page slug.
 * @param locale Page language.
 * @returns The page, or null when it does not exist or is unpublished.
 */
export async function loadPageContent(
  app: Container,
  slug: string,
  locale: Locale,
): Promise<PageContent | null> {
  const stored = await app.pages.findBySlug(slug);
  if (stored) {
    if (!stored.isPublished) return null;
    return {
      title: pickText(stored.title, locale, 'es'),
      // No fallback to the other language: a Spanish description on an English page is worse than the store default.
      seoTitle: stored.seoTitle[locale] ?? '',
      seoDescription: stored.seoDescription[locale] ?? '',
      sections: stored.sections,
    };
  }
  const fallback = DEFAULT_SYSTEM_PAGES.find((page) => page.slug === slug);
  if (!fallback) return null;
  return {
    title: pickText(fallback.title, locale, 'es'),
    seoTitle: '',
    seoDescription: '',
    sections: fallback.sections.map((section, index) => ({
      id: `${slug}-${index}`,
      type: section.type,
      enabled: section.enabled,
      config: section.config,
    })),
  };
}

/**
 * Loads the products and categories that the enabled widgets on a page need.
 * @param app Request container.
 * @param sections Page sections.
 * @param locale Page language.
 * @param options Catalog parsing options (currency exponent, default sort).
 * @param catalog Catalog settings: the "new" badge window and what to do with out-of-stock products.
 * @returns Data keyed by section id.
 */
export async function loadSectionData(
  app: Container,
  sections: WidgetInstance[],
  locale: Locale,
  options: CatalogOptions,
  catalog: { newDays: number; showOutOfStock: 'last' | 'hide' | 'normal' },
): Promise<SectionData> {
  const service = app.catalog(catalog);
  const enabled = sections.filter((section) => section.enabled);
  const needsCategories = enabled.some(
    (section) => section.type === 'category_grid' || section.type === 'featured_products',
  );
  // Testimonials are loaded only when a section shows manual ones; the widget applies its own count.
  const wantsTestimonials = enabled.some(
    (section) =>
      section.type === 'testimonials' &&
      (section.config as { includeManual?: boolean }).includeManual !== false,
  );
  const [categories, testimonials] = await Promise.all([
    needsCategories ? service.listCategories(locale) : Promise.resolve<CategoryDto[]>([]),
    wantsTestimonials ? app.testimonials.listVisible() : Promise.resolve<Testimonial[]>([]),
  ]);

  const productsBySection: Record<string, ProductCardDto[]> = {};
  for (const section of enabled) {
    if (section.type !== 'featured_products') continue;
    const config = section.config as {
      source?: string;
      limit?: number;
      categoryIds?: string[];
      productIds?: string[];
    };
    const limit = Math.min(MAX_FEATURED, Math.max(1, config.limit ?? 8));
    if (config.source === 'manual') {
      productsBySection[section.id] = await service.listProductsByIds(locale, config.productIds ?? []);
      continue;
    }
    const sort =
      config.source === 'newest' ? 'newest' : config.source === 'best_sellers' ? 'best_sellers' : 'featured';
    const params = new URLSearchParams({ sort });
    if (config.source === 'category') {
      const slug = categories.find((category) => category.id === config.categoryIds?.[0])?.slug;
      if (slug) params.set('category', slug);
    }
    const query = parseCatalogQuery(params, locale, options);
    productsBySection[section.id] = (await service.listProducts(query, limit)).items;
  }
  return {
    productsBySection,
    categories,
    testimonials,
    media: await loadSectionImages(app, enabled, locale),
  };
}

/**
 * Reads the pictures the enabled sections use, in one query.
 * @param app Request container.
 * @param sections Enabled sections.
 * @param locale Page language, for the picture descriptions.
 * @returns The pictures by media id.
 */
async function loadSectionImages(
  app: Container,
  sections: WidgetInstance[],
  locale: Locale,
): Promise<Record<string, SectionImage>> {
  const ids = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value !== '') ids.add(value);
  };
  for (const section of sections) {
    const config = section.config as { slides?: { image?: unknown }[]; image?: unknown; images?: unknown };
    if (section.type === 'hero_carousel') for (const slide of config.slides ?? []) add(slide.image);
    if (section.type === 'promo_banner') add(config.image);
    if (section.type === 'image_gallery' && Array.isArray(config.images)) config.images.forEach(add);
  }
  const assets = await app.mediaLibrary.getMany([...ids]);
  return Object.fromEntries(
    assets.map((asset) => [
      asset.id,
      {
        width: asset.width,
        height: asset.height,
        alt: asset.alt[locale] ?? '',
        variants: [...asset.variants]
          .sort((a, b) => a.width - b.width)
          .map(({ width, key }) => ({ width, key })),
      },
    ]),
  );
}
