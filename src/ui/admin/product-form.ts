// Editor state of one product. Money and percentages are kept as the admin typed them and converted to stored units only
// when saving, so an unfinished number never reaches the server or silently becomes zero.
import { productInput, type ProductInput } from '@/application/catalog/schemas';
import { majorTextFromMinor, minorFromMajorText } from '@/domain/shared/money';

/** Text fields of one language. */
export interface TextForm {
  name: string;
  slug: string;
  shortDescription: string;
  descriptionMd: string;
  seoTitle: string;
  seoDescription: string;
}

/** One variant as typed. Numbers stay text until they are saved, so an empty field is not zero. */
export interface VariantForm {
  id: string | null;
  sku: string;
  barcode: string;
  price: string;
  compareAt: string;
  cost: string;
  stock: string;
  stockBefore: number | null;
  track: boolean;
  threshold: string;
  imageMediaId: string | null;
  isActive: boolean;
  attributeValueIds: string[];
}

/** The whole product as the editor edits it. */
export interface ProductForm {
  id: string | null;
  status: 'draft' | 'active' | 'archived';
  basePrice: string;
  compareAt: string;
  /** Percent as typed ("19"); empty means the store rate. */
  taxPercent: string;
  isFeatured: boolean;
  translations: { es: TextForm; en: TextForm };
  categoryIds: string[];
  imageIds: string[];
  variants: VariantForm[];
  stockNote: string;
}

/** The money rule the conversions need: minor-unit digits of the store currency. */
export interface MoneyFormat {
  exponent: number;
}

/**
 * A new variant as the editor creates it: active, tracked, with no stock and no attributes yet.
 * @returns An empty variant form.
 */
export function blankVariant(): VariantForm {
  return {
    id: null,
    sku: '',
    barcode: '',
    price: '',
    compareAt: '',
    cost: '',
    stock: '0',
    stockBefore: null,
    track: true,
    threshold: '',
    imageMediaId: null,
    isActive: true,
    attributeValueIds: [],
  };
}

/**
 * Converts stored input (minor units, bp) to the typed form.
 * @param input Product as the server sends it.
 * @param money Money rule of the store currency.
 * @returns The editor state.
 */
export function formFromInput(input: ProductInput, money: MoneyFormat): ProductForm {
  return {
    id: input.id,
    status: input.status,
    basePrice: majorTextFromMinor(input.basePriceMinor, money.exponent),
    compareAt:
      input.compareAtPriceMinor === null ? '' : majorTextFromMinor(input.compareAtPriceMinor, money.exponent),
    taxPercent: input.taxRateBp === null ? '' : String(input.taxRateBp / 100),
    isFeatured: input.isFeatured,
    translations: { es: textForm(input.translations.es), en: textForm(input.translations.en) },
    categoryIds: input.categoryIds,
    imageIds: input.imageIds,
    variants: input.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku ?? '',
      barcode: variant.barcode ?? '',
      price: variant.priceMinor === null ? '' : majorTextFromMinor(variant.priceMinor, money.exponent),
      compareAt:
        variant.compareAtPriceMinor === null
          ? ''
          : majorTextFromMinor(variant.compareAtPriceMinor, money.exponent),
      cost: variant.costMinor === null ? '' : majorTextFromMinor(variant.costMinor, money.exponent),
      stock: String(variant.stock),
      stockBefore: variant.stockBefore,
      track: variant.trackInventory,
      threshold: variant.lowStockThreshold === null ? '' : String(variant.lowStockThreshold),
      imageMediaId: variant.imageMediaId,
      isActive: variant.isActive,
      attributeValueIds: variant.attributeValueIds,
    })),
    stockNote: input.stockNote ?? '',
  };
}

/**
 * Converts the typed form to the stored input. Anything that does not parse, or that the shared schema rejects, is
 * reported instead of being saved.
 * @param form Editor state.
 * @param money Money rule of the store currency.
 * @returns The validated input, or `null` when something must be fixed first.
 */
export function inputFromForm(form: ProductForm, money: MoneyFormat): ProductInput | null {
  const minor = (text: string, required: boolean): number | null | undefined => {
    if (text.trim() === '') return required ? undefined : null;
    return minorFromMajorText(text, money.exponent) ?? undefined;
  };
  const whole = (text: string, required: boolean): number | null | undefined => {
    if (text.trim() === '') return required ? undefined : null;
    const value = Number(text);
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  };
  const basePriceMinor = minor(form.basePrice, true);
  const compareAtPriceMinor = minor(form.compareAt, false);
  const taxRateBp = form.taxPercent.trim() === '' ? null : Math.round(Number(form.taxPercent) * 100);
  const variants = form.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku.trim() || null,
    barcode: variant.barcode.trim() || null,
    priceMinor: minor(variant.price, false),
    compareAtPriceMinor: minor(variant.compareAt, false),
    costMinor: minor(variant.cost, false),
    stock: whole(variant.stock, true),
    stockBefore: variant.stockBefore,
    trackInventory: variant.track,
    lowStockThreshold: whole(variant.threshold, false),
    imageMediaId: variant.imageMediaId,
    isActive: variant.isActive,
    attributeValueIds: variant.attributeValueIds,
  }));
  const candidate = {
    id: form.id,
    status: form.status,
    basePriceMinor,
    compareAtPriceMinor,
    taxRateBp: taxRateBp !== null && Number.isFinite(taxRateBp) ? taxRateBp : undefined,
    isFeatured: form.isFeatured,
    translations: form.translations,
    categoryIds: form.categoryIds,
    imageIds: form.imageIds,
    variants,
    stockNote: form.stockNote.trim() || null,
  };
  const parsed = productInput.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/**
 * Typed form of one language's text.
 * @param text Stored translation.
 * @returns The form fields.
 */
function textForm(text: ProductInput['translations']['es']): TextForm {
  return {
    name: text.name,
    slug: text.slug,
    shortDescription: text.shortDescription,
    descriptionMd: text.descriptionMd,
    seoTitle: text.seoTitle,
    seoDescription: text.seoDescription,
  };
}
