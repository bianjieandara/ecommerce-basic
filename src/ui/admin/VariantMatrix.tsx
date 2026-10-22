// Variants of one product: generate the combinations of chosen attribute values, then edit each variant's identity, prices,
// stock and flags. Stored variants are deactivated rather than removed, so their stock history stays intact.
import { useState } from 'preact/hooks';
import { BUTTON, FIELD, LABEL, LINK_BUTTON, PANEL } from './lib/classes';
import type { AttributeOption, MediaOption } from './catalog-options';
import { blankVariant, type VariantForm } from './product-form';
import type { AdminLabels } from './ProductFields';

/** Props of the variant matrix. */
export interface VariantMatrixProps {
  variants: VariantForm[];
  setVariants: (variants: VariantForm[]) => void;
  attributes: AttributeOption[];
  images: MediaOption[];
  currency: string;
  defaultThreshold: number;
  labels: AdminLabels;
}

/**
 * Key of an attribute combination, independent of the order of its values.
 * @param ids Attribute value ids.
 * @returns A stable key.
 */
function comboKey(ids: string[]): string {
  return [...ids].sort().join('|');
}

/**
 * Every combination with one value from each group.
 * @param groups Chosen values per attribute.
 * @returns The combinations, in attribute order.
 */
function combinations(groups: string[][]): string[][] {
  return groups.reduce<string[][]>(
    (combos, group) => combos.flatMap((combo) => group.map((value) => [...combo, value])),
    [[]],
  );
}

/**
 * Variant editor with the attribute combination generator.
 * @param props Variants, attributes, images and strings.
 */
export default function VariantMatrix(props: VariantMatrixProps) {
  const { variants, setVariants, attributes, images, currency, defaultThreshold, labels } = props;
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const labelOf = new Map(
    attributes.flatMap((attribute) => attribute.values.map((value) => [value.id, value.label] as const)),
  );

  /**
   * Changes fields of one variant.
   * @param index Position in the list.
   * @param change Fields to change.
   */
  function patch(index: number, change: Partial<VariantForm>) {
    setVariants(
      variants.map((variant, position) => (position === index ? { ...variant, ...change } : variant)),
    );
  }

  /**
   * Removes a new variant, or deactivates a stored one.
   * @param index Position in the list.
   */
  function drop(index: number) {
    const variant = variants[index];
    if (!variant) return;
    if (variant.id === null) setVariants(variants.filter((_, position) => position !== index));
    else patch(index, { isActive: !variant.isActive });
  }

  /**
   * Adds or removes one value from the generator selection.
   * @param attributeId Attribute id.
   * @param valueId Value id.
   */
  function toggleValue(attributeId: string, valueId: string) {
    const current = chosen[attributeId] ?? [];
    const next = current.includes(valueId) ? current.filter((id) => id !== valueId) : [...current, valueId];
    setChosen({ ...chosen, [attributeId]: next });
  }

  /**
   * Adds a new variant for every chosen combination that does not exist yet.
   */
  function generate() {
    const groups = attributes
      .map((attribute) => chosen[attribute.id] ?? [])
      .filter((group) => group.length > 0);
    if (groups.length === 0) return;
    const existing = new Set(variants.map((variant) => comboKey(variant.attributeValueIds)));
    const fresh = combinations(groups)
      .filter((combo) => !existing.has(comboKey(combo)))
      .map((combo) => ({ ...blankVariant(), attributeValueIds: combo }));
    // A simple product's variant cannot sit next to attribute variants: an unsaved one is dropped, a stored one is
    // deactivated so its stock history stays intact.
    const kept = variants
      .filter((variant) => !(variant.id === null && variant.attributeValueIds.length === 0))
      .map((variant) => (variant.attributeValueIds.length === 0 ? { ...variant, isActive: false } : variant));
    setVariants([...kept, ...fresh]);
  }

  return (
    <section class={PANEL} aria-labelledby="variants-title">
      <h2 id="variants-title" class="text-lg font-semibold">
        {labels.product.variants}
      </h2>
      {attributes.length > 0 && (
        <div class="rounded-brand border-text/15 flex flex-col gap-3 border p-3">
          <p class="text-sm font-semibold">{labels.product.generateTitle}</p>
          {attributes.map((attribute) => (
            <fieldset class="flex flex-col gap-2 text-sm">
              <legend class="font-semibold">{attribute.label}</legend>
              <div class="flex flex-wrap gap-2">
                {attribute.values.map((value) => (
                  <label class="rounded-brand border-text/20 flex min-h-11 items-center gap-2 border px-3">
                    <input
                      type="checkbox"
                      class="size-5"
                      checked={(chosen[attribute.id] ?? []).includes(value.id)}
                      onChange={() => toggleValue(attribute.id, value.id)}
                    />
                    {value.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <button type="button" class={BUTTON} onClick={generate}>
            {labels.product.generate}
          </button>
        </div>
      )}

      <ul class="flex flex-col gap-3">
        {variants.map((variant, index) => (
          <li
            class={`rounded-brand border-text/15 flex flex-col gap-3 border p-3 ${variant.isActive ? '' : 'opacity-60'}`}
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-semibold">
                {variant.attributeValueIds.map((id) => labelOf.get(id) ?? '').join(' / ') ||
                  labels.product.simpleProduct}
              </p>
              <button type="button" class={LINK_BUTTON} onClick={() => drop(index)}>
                {variant.id === null
                  ? labels.product.remove
                  : variant.isActive
                    ? labels.product.deactivate
                    : labels.product.restore}
              </button>
            </div>
            <div class="grid gap-3 sm:grid-cols-3">
              <label class={LABEL}>
                {labels.product.sku}
                <input
                  class={FIELD}
                  value={variant.sku}
                  onInput={(e) => patch(index, { sku: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.barcode}
                <input
                  class={FIELD}
                  value={variant.barcode}
                  onInput={(e) => patch(index, { barcode: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.stock}
                <input
                  class={FIELD}
                  inputMode="numeric"
                  value={variant.stock}
                  onInput={(e) => patch(index, { stock: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.price} ({currency})
                <input
                  class={FIELD}
                  inputMode="decimal"
                  placeholder={labels.product.priceHint}
                  value={variant.price}
                  onInput={(e) => patch(index, { price: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.compareAt} ({currency})
                <input
                  class={FIELD}
                  inputMode="decimal"
                  value={variant.compareAt}
                  onInput={(e) => patch(index, { compareAt: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.cost} ({currency})
                <input
                  class={FIELD}
                  inputMode="decimal"
                  value={variant.cost}
                  onInput={(e) => patch(index, { cost: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.threshold}
                <input
                  class={FIELD}
                  inputMode="numeric"
                  placeholder={String(defaultThreshold)}
                  value={variant.threshold}
                  onInput={(e) => patch(index, { threshold: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.product.image}
                <select
                  class={FIELD}
                  value={variant.imageMediaId ?? ''}
                  onChange={(e) => patch(index, { imageMediaId: e.currentTarget.value || null })}
                >
                  <option value="">{labels.product.noImage}</option>
                  {images.map((image) => (
                    <option value={image.id}>{image.name}</option>
                  ))}
                </select>
              </label>
              <div class="flex flex-col gap-2 text-sm">
                <label class="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    class="size-5"
                    checked={variant.track}
                    onChange={(e) => patch(index, { track: e.currentTarget.checked })}
                  />
                  {labels.product.track}
                </label>
                <label class="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    class="size-5"
                    checked={variant.isActive}
                    onChange={(e) => patch(index, { isActive: e.currentTarget.checked })}
                  />
                  {labels.product.active}
                </label>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" class={BUTTON} onClick={() => setVariants([...variants, blankVariant()])}>
        {labels.product.addVariant}
      </button>
    </section>
  );
}
