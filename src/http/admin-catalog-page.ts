// Page data for the admin catalog: product list filters, the editor's starting state, and the option lists the screens use.
// Pages call these helpers, so the mapping from domain objects to what the screens show lives in one place.
import type { ProductInput, ProductTextInput } from '@/application/catalog/schemas';
import type { AdminCategory, AdminAttribute, AdminProductFilter } from '@/application/ports/catalog-admin';
import type { MediaAsset } from '@/application/ports/media';
import type { Container } from '@/composition/create-container';
import type { Product, ProductTranslation } from '@/domain/catalog/product';
import { CURRENCIES } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { PATHS } from '@/domain/shared/paths';
import { orderTree } from '@/ui/admin/lib/category-order';
import type { AttributeOption, CategoryOption, MediaOption } from '@/ui/admin/catalog-options';
import { ADMIN_LIST_PAGE_SIZE } from './admin-lists';
import { positiveInteger } from './list-query';

/**
 * Reads the product list filters from the query string. Unknown values fall back to "everything".
 * @param params Query string of the list page.
 * @returns The filters and the page.
 */
export function productFilterFrom(params: URLSearchParams): AdminProductFilter {
  const status = params.get('status');
  return {
    search: (params.get('q') ?? '').trim().slice(0, 120),
    status: status === 'draft' || status === 'active' || status === 'archived' ? status : 'all',
    categoryId: params.get('category') || null,
    onSale: params.get('sale') === '1',
    outOfStock: params.get('stock') === '1',
    page: positiveInteger(params.get('page')),
    pageSize: ADMIN_LIST_PAGE_SIZE,
  };
}

/**
 * Text in the requested language, falling back to Spanish, then English.
 * @param values Text per language, possibly missing.
 * @param locale Requested language.
 * @returns The text, or an empty string.
 */
export function textIn(values: Partial<Record<Locale, string>>, locale: Locale): string {
  return values[locale] || values.es || values.en || '';
}

/**
 * Category options for the product editor and the filters: the tree in display order, with depth.
 * @param categories All categories.
 * @param locale Language of the names.
 * @returns The options.
 */
export function categoryOptions(categories: AdminCategory[], locale: Locale): CategoryOption[] {
  return orderTree(categories).map(({ item, depth }) => ({
    id: item.id,
    label: textIn({ es: item.translations.es?.name, en: item.translations.en?.name }, locale),
    depth,
  }));
}

/**
 * Attribute options with their values, in display order.
 * @param attributes All attributes.
 * @param locale Language of the labels.
 * @returns The options.
 */
export function attributeOptions(attributes: AdminAttribute[], locale: Locale): AttributeOption[] {
  return attributes.map((attribute) => ({
    id: attribute.id,
    label: textIn(attribute.name, locale),
    values: attribute.values.map((value) => ({
      id: value.id,
      label: textIn(value.label, locale),
      colorHex: value.colorHex,
    })),
  }));
}

/**
 * Library images as options, using the smallest stored size for the thumbnail.
 * @param assets Stored assets.
 * @returns The options.
 */
export function mediaOptions(assets: MediaAsset[]): MediaOption[] {
  return assets.map((asset) => {
    const smallest = [...asset.variants].sort((a, b) => a.width - b.width)[0];
    return { id: asset.id, src: smallest ? PATHS.media(smallest.key) : '', name: asset.originalName };
  });
}

/**
 * The editor's starting state for a stored product. The loaded stock is kept as `stockBefore`, so the save applies only
 * what the admin changes.
 * @param product Stored product.
 * @returns The editor input.
 */
export function editorInputOf(product: Product): ProductInput {
  return {
    id: product.id,
    status: product.status,
    basePriceMinor: product.basePriceMinor,
    compareAtPriceMinor: product.compareAtPriceMinor,
    taxRateBp: product.taxRateBp,
    isFeatured: product.isFeatured,
    translations: { es: textInputOf(product.translations.es), en: textInputOf(product.translations.en) },
    categoryIds: product.categoryIds,
    imageIds: product.imageIds,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      barcode: variant.barcode,
      priceMinor: variant.priceMinor,
      compareAtPriceMinor: variant.compareAtPriceMinor,
      costMinor: variant.costMinor,
      stock: variant.stock,
      stockBefore: variant.stock,
      trackInventory: variant.trackInventory,
      lowStockThreshold: variant.lowStockThreshold,
      imageMediaId: variant.imageMediaId,
      isActive: variant.isActive,
      attributeValueIds: variant.attributeValueIds,
    })),
    stockNote: null,
  };
}

/**
 * The editor's starting state for a new product: one active variant, no stock, no attributes.
 * @returns The editor input.
 */
export function blankEditorInput(): ProductInput {
  const blankText: ProductTextInput = {
    name: '',
    slug: '',
    shortDescription: '',
    descriptionMd: '',
    seoTitle: '',
    seoDescription: '',
  };
  return {
    id: null,
    status: 'draft',
    basePriceMinor: 0,
    compareAtPriceMinor: null,
    taxRateBp: null,
    isFeatured: false,
    translations: { es: blankText, en: blankText },
    categoryIds: [],
    imageIds: [],
    variants: [
      {
        id: null,
        sku: null,
        barcode: null,
        priceMinor: null,
        compareAtPriceMinor: null,
        costMinor: null,
        stock: 0,
        stockBefore: null,
        trackInventory: true,
        lowStockThreshold: null,
        imageMediaId: null,
        isActive: true,
        attributeValueIds: [],
      },
    ],
    stockNote: null,
  };
}

/**
 * Everything the product editor needs in one call. A product id that does not exist yields null.
 * @param app Request container.
 * @param productId Product to edit, or null for a new product.
 * @param locale Language of the option labels.
 * @returns The editor data, or null when the product does not exist.
 */
export async function loadProductEditor(app: Container, productId: string | null, locale: Locale) {
  const [product, categories, attributes, media, general, inventory] = await Promise.all([
    productId ? app.catalogAdmin.products.findById(productId) : Promise.resolve(null),
    app.catalogAdmin.categories.list(),
    app.catalogAdmin.attributes.list(),
    app.mediaLibrary.list(1, 60),
    app.settings.get('general'),
    app.settings.get('inventory'),
  ]);
  if (productId && !product) return null;
  return {
    initial: product ? editorInputOf(product) : blankEditorInput(),
    categories: categoryOptions(categories, locale),
    attributes: attributeOptions(attributes, locale),
    media: mediaOptions(media.items),
    currency: general.currency,
    exponent: CURRENCIES[general.currency].exponent,
    defaultLowStockThreshold: inventory.defaultLowStockThreshold,
  };
}

/**
 * Text of a translation as the editor edits it.
 * @param text Stored translation.
 * @returns The editor text.
 */
function textInputOf(text: ProductTranslation): ProductTextInput {
  return {
    name: text.name,
    slug: text.slug,
    shortDescription: text.shortDescription,
    descriptionMd: text.descriptionMd,
    seoTitle: text.seoTitle,
    seoDescription: text.seoDescription,
  };
}
