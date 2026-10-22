// One variant of a product: identity, prices, stock and flags. A stored variant is deactivated rather than removed.
import { FIELD, LABEL, LINK_BUTTON } from './lib/classes';
import type { MediaOption } from './catalog-options';
import type { VariantForm } from './product-form';
import type { AdminLabels } from './ProductFields';

/** Props of one variant row. */
export interface VariantRowProps {
  variant: VariantForm;
  /** Attribute values joined for display, for example "M / Red". Empty for a simple product. */
  label: string;
  currency: string;
  defaultThreshold: number;
  images: MediaOption[];
  labels: AdminLabels;
  onPatch: (change: Partial<VariantForm>) => void;
  onDrop: () => void;
}

/**
 * Editable fields of one variant.
 * @param props Variant, its label, and the change and removal handlers.
 */
export default function VariantRow(props: VariantRowProps) {
  const { variant, label, currency, defaultThreshold, images, labels, onPatch, onDrop } = props;
  return (
    <li
      class={`rounded-brand border-text/15 flex flex-col gap-3 border p-3 ${variant.isActive ? '' : 'opacity-60'}`}
    >
      <div class="flex items-center justify-between gap-2">
        <p class="font-semibold">{label || labels.product.simpleProduct}</p>
        <button type="button" class={LINK_BUTTON} onClick={onDrop}>
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
          <input class={FIELD} value={variant.sku} onInput={(e) => onPatch({ sku: e.currentTarget.value })} />
        </label>
        <label class={LABEL}>
          {labels.product.barcode}
          <input
            class={FIELD}
            value={variant.barcode}
            onInput={(e) => onPatch({ barcode: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.stock}
          <input
            class={FIELD}
            inputMode="numeric"
            value={variant.stock}
            onInput={(e) => onPatch({ stock: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.price} ({currency})
          <input
            class={FIELD}
            inputMode="decimal"
            placeholder={labels.product.priceHint}
            value={variant.price}
            onInput={(e) => onPatch({ price: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.compareAt} ({currency})
          <input
            class={FIELD}
            inputMode="decimal"
            value={variant.compareAt}
            onInput={(e) => onPatch({ compareAt: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.cost} ({currency})
          <input
            class={FIELD}
            inputMode="decimal"
            value={variant.cost}
            onInput={(e) => onPatch({ cost: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.threshold}
          <input
            class={FIELD}
            inputMode="numeric"
            placeholder={String(defaultThreshold)}
            value={variant.threshold}
            onInput={(e) => onPatch({ threshold: e.currentTarget.value })}
          />
        </label>
        <label class={LABEL}>
          {labels.product.image}
          <select
            class={FIELD}
            value={variant.imageMediaId ?? ''}
            onChange={(e) => onPatch({ imageMediaId: e.currentTarget.value || null })}
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
              onChange={(e) => onPatch({ track: e.currentTarget.checked })}
            />
            {labels.product.track}
          </label>
          <label class="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              class="size-5"
              checked={variant.isActive}
              onChange={(e) => onPatch({ isActive: e.currentTarget.checked })}
            />
            {labels.product.active}
          </label>
        </div>
      </div>
    </li>
  );
}
