// Live preview of a product's store card (Preact). It reads the editor's form state, so the picture, name, price and sale badge
// change as the owner types. It mirrors the storefront card (a tinted tile with the price on it, the name and the category
// under it) without importing it: the real card is an Astro component and a server-side one.
import type { CategoryOption, MediaOption } from './catalog-options';
import type { ProductForm } from './product-form';

/** Props of the preview. The texts arrive translated from the page. */
export interface ProductPreviewProps {
  form: ProductForm;
  media: MediaOption[];
  categories: CategoryOption[];
  currency: string;
  /** Language the owner reads the admin in; the card shows the name in it, then in the other language. */
  locale: 'es' | 'en';
  texts: { title: string; onSale: string; noName: string };
}

/** A price as typed ("19,90" or "19.90") as a number; NaN when it is not one. */
function typedNumber(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

/**
 * The card as the store would draw it.
 * @param props Form state, library, categories and texts.
 */
export default function ProductPreview({
  form,
  media,
  categories,
  currency,
  locale,
  texts,
}: ProductPreviewProps) {
  const other = locale === 'es' ? 'en' : 'es';
  const name = form.translations[locale].name.trim() || form.translations[other].name.trim() || texts.noName;
  const picture = media.find((image) => image.id === form.imageIds[0]);
  const category = categories.find((item) => form.categoryIds.includes(item.id));
  const price = typedNumber(form.basePrice);
  const compareAt = typedNumber(form.compareAt);
  const onSale = Number.isFinite(price) && Number.isFinite(compareAt) && compareAt > price;
  return (
    <aside
      class="rounded-card border-text/10 bg-background flex flex-col gap-3 border p-5"
      aria-label={texts.title}
    >
      <p class="eyebrow">{texts.title}</p>
      <div class="rounded-card bg-accent-soft relative overflow-hidden">
        {picture ? (
          <img src={picture.src} alt="" class="aspect-square w-full object-cover mix-blend-multiply" />
        ) : (
          <span
            class="font-display text-text/15 flex aspect-square w-full items-center justify-center text-8xl font-semibold"
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        {onSale && (
          <span class="bg-accent text-on-primary absolute top-3 left-3 rounded-full px-2.5 py-0.5 text-xs font-semibold">
            {texts.onSale}
          </span>
        )}
        {form.basePrice.trim() !== '' && (
          <span class="bg-primary text-on-primary absolute right-3 bottom-3 rounded-full px-3 py-2 text-sm tabular-nums">
            {form.basePrice} {currency}
            {onSale && <s class="ml-2 opacity-70">{form.compareAt}</s>}
          </span>
        )}
      </div>
      <div class="text-center">
        <p class="font-medium wrap-break-word">{name}</p>
        {category && <p class="text-text/70 text-xs">{category.label}</p>}
      </div>
    </aside>
  );
}
