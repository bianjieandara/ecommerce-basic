// Product details (status, prices, tax, categories) and the text in each language, behind Spanish and English tabs.
import { useState } from 'preact/hooks';
import type { Dictionary } from '@/ui/i18n';
import { FIELD, LABEL, LINK_BUTTON, PANEL } from './lib/classes';
import type { CategoryOption } from './catalog-options';
import type { ProductForm, TextForm } from './product-form';

/** The admin strings, as the page passes them. */
export type AdminLabels = Dictionary['admin'];

/** Props of the details and text section. */
export interface ProductFieldsProps {
  form: ProductForm;
  patch: (change: Partial<ProductForm>) => void;
  labels: AdminLabels;
  categories: CategoryOption[];
  currency: string;
}

/**
 * Details and text of one product.
 * @param props Form state, its setter and the strings.
 */
export default function ProductFields(props: ProductFieldsProps) {
  const { form, patch, labels, categories, currency } = props;
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const text = form.translations[language];

  /**
   * Changes fields of the language that is open.
   * @param change Fields to change.
   */
  function setText(change: Partial<TextForm>) {
    patch({ translations: { ...form.translations, [language]: { ...text, ...change } } });
  }

  /**
   * Adds or removes a category.
   * @param id Category id.
   */
  function toggleCategory(id: string) {
    patch({
      categoryIds: form.categoryIds.includes(id)
        ? form.categoryIds.filter((item) => item !== id)
        : [...form.categoryIds, id],
    });
  }

  return (
    <>
      <section class={PANEL} aria-labelledby="details-title">
        <h2 id="details-title" class="text-lg font-semibold">
          {labels.product.details}
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <label class={LABEL}>
            {labels.product.status}
            <select
              class={FIELD}
              value={form.status}
              onChange={(event) => patch({ status: event.currentTarget.value as ProductForm['status'] })}
            >
              <option value="draft">{labels.status.draft}</option>
              <option value="active">{labels.status.active}</option>
              <option value="archived">{labels.status.archived}</option>
            </select>
          </label>
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              class="size-5"
              checked={form.isFeatured}
              onChange={(event) => patch({ isFeatured: event.currentTarget.checked })}
            />
            {labels.product.featured}
          </label>
          <label class={LABEL}>
            {labels.product.basePrice} ({currency})
            <input
              class={FIELD}
              inputMode="decimal"
              value={form.basePrice}
              onInput={(event) => patch({ basePrice: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.compareAt} ({currency})
            <input
              class={FIELD}
              inputMode="decimal"
              value={form.compareAt}
              onInput={(event) => patch({ compareAt: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.taxRate}
            <input
              class={FIELD}
              inputMode="decimal"
              placeholder={labels.product.taxRateHint}
              value={form.taxPercent}
              onInput={(event) => patch({ taxPercent: event.currentTarget.value })}
            />
          </label>
        </div>
        <fieldset class="flex flex-col gap-2 text-sm">
          <legend class="mb-1 font-semibold">{labels.product.categories}</legend>
          {categories.length === 0 && <p class="text-text/70">{labels.product.noCategories}</p>}
          {categories.map((category) => (
            <label class="flex min-h-11 items-center gap-3" style={{ paddingLeft: `${category.depth}rem` }}>
              <input
                type="checkbox"
                class="size-5"
                checked={form.categoryIds.includes(category.id)}
                onChange={() => toggleCategory(category.id)}
              />
              {category.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section class={PANEL} aria-labelledby="text-title">
        <h2 id="text-title" class="text-lg font-semibold">
          {labels.product.text}
        </h2>
        <div class="flex gap-2" role="group" aria-label={labels.product.text}>
          {(['es', 'en'] as const).map((code) => (
            <button
              type="button"
              class={LINK_BUTTON}
              aria-pressed={language === code}
              data-active={language === code}
              onClick={() => setLanguage(code)}
            >
              {labels.product.languages[code]}
            </button>
          ))}
        </div>
        <div class="grid gap-4">
          <label class={LABEL}>
            {labels.product.name}
            <input
              class={FIELD}
              value={text.name}
              onInput={(event) => setText({ name: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.slug}
            <input
              class={FIELD}
              placeholder={labels.product.slugHint}
              value={text.slug}
              onInput={(event) => setText({ slug: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.shortDescription}
            <input
              class={FIELD}
              value={text.shortDescription}
              onInput={(event) => setText({ shortDescription: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.description}
            <textarea
              class={`${FIELD} min-h-32 py-2`}
              rows={6}
              value={text.descriptionMd}
              onInput={(event) => setText({ descriptionMd: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.seoTitle}
            <input
              class={FIELD}
              value={text.seoTitle}
              onInput={(event) => setText({ seoTitle: event.currentTarget.value })}
            />
          </label>
          <label class={LABEL}>
            {labels.product.seoDescription}
            <textarea
              class={`${FIELD} min-h-20 py-2`}
              rows={3}
              value={text.seoDescription}
              onInput={(event) => setText({ seoDescription: event.currentTarget.value })}
            />
          </label>
        </div>
      </section>
    </>
  );
}
