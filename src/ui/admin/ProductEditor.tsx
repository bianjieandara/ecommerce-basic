// Product editor: one form for the details, text, images and variants. It validates with the shared schema, saves through
// the product endpoint, and then reloads the saved product so its stock is current.
import { useState } from 'preact/hooks';
import type { ProductInput } from '@/application/catalog/schemas';
import { postJson } from './lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, PANEL } from './lib/classes';
import type { AttributeOption, CategoryOption, MediaOption } from './catalog-options';
import ImagePicker from './ImagePicker';
import ProductFields, { type AdminLabels } from './ProductFields';
import ProductPreview from './ProductPreview';
import VariantMatrix from './VariantMatrix';
import { formFromInput, inputFromForm, type MoneyFormat, type ProductForm } from './product-form';

/** Props of the product editor, all prepared by the page. */
export interface ProductEditorProps {
  initial: ProductInput;
  labels: AdminLabels;
  errors: Record<string, string>;
  categories: CategoryOption[];
  attributes: AttributeOption[];
  media: MediaOption[];
  money: MoneyFormat;
  currency: string;
  defaultLowStockThreshold: number;
  listHref: string;
  /** Language of the admin and the texts of the live preview. */
  locale: 'es' | 'en';
  preview: { title: string; onSale: string; noName: string };
}

/**
 * The product editor.
 * @param props Initial product, options and strings.
 */
export default function ProductEditor(props: ProductEditorProps) {
  const { labels, errors } = props;
  const [form, setForm] = useState<ProductForm>(() => formFromInput(props.initial, props.money));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Changes parts of the form.
   * @param change Fields to change.
   */
  function patch(change: Partial<ProductForm>) {
    setForm((current) => ({ ...current, ...change }));
  }

  /**
   * Validates and saves the product. A saved product reloads, so its stock and ids are the stored ones.
   */
  async function save() {
    const input = inputFromForm(form, props.money);
    if (!input) {
      setMessage(errors.VALIDATION_FAILED ?? '');
      return;
    }
    setBusy(true);
    setMessage('');
    const result = await postJson<{ id: string }>('/api/admin/products', input);
    if (result.ok) {
      window.location.assign(`/admin/products/${result.data.id}?saved=1`);
      return;
    }
    setBusy(false);
    setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  return (
    <form
      class="grid items-start gap-6 pb-32 lg:grid-cols-[minmax(0,1fr)_19rem]"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div class="flex min-w-0 flex-col gap-6">
        <ProductFields
          form={form}
          patch={patch}
          labels={labels}
          categories={props.categories}
          currency={props.currency}
        />
        <ImagePicker
          selected={form.imageIds}
          media={props.media}
          onChange={(imageIds) => patch({ imageIds })}
          labels={labels}
        />
        <VariantMatrix
          variants={form.variants}
          setVariants={(variants) => patch({ variants })}
          attributes={props.attributes}
          images={props.media.filter((image) => form.imageIds.includes(image.id))}
          currency={props.currency}
          defaultThreshold={props.defaultLowStockThreshold}
          labels={labels}
        />
        <section class={PANEL}>
          <label class={LABEL}>
            {labels.product.stockNote}
            <input
              class={FIELD}
              value={form.stockNote}
              placeholder={labels.product.stockNoteHint}
              onInput={(event) => patch({ stockNote: event.currentTarget.value })}
            />
          </label>
        </section>
      </div>
      <div class="lg:sticky lg:top-24">
        <ProductPreview
          form={form}
          media={props.media}
          categories={props.categories}
          currency={props.currency}
          locale={props.locale}
          texts={props.preview}
        />
      </div>
      <div class="rounded-card border-text/15 bg-background fixed inset-x-3 bottom-3 z-10 mx-auto flex max-w-3xl flex-wrap items-center gap-3 border p-3 shadow-lg">
        {message && (
          <p role="alert" class={`${ERROR_TEXT} w-full`}>
            {message}
          </p>
        )}
        <a href={props.listHref} class={BUTTON}>
          {labels.common.back}
        </a>
        <button type="submit" disabled={busy} class={`${BUTTON_PRIMARY} ml-auto`}>
          {busy ? labels.common.submitting : labels.common.save}
        </button>
      </div>
    </form>
  );
}
