// Attribute manager: attributes such as Size or Color, each with its ordered values. A value a variant uses cannot be
// removed; the server says so, and the editor shows the message.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, LINK_BUTTON, PANEL } from './lib/classes';
import type { AdminLabels } from './ProductFields';

/** One value of an attribute as the page sends it. */
export interface AttributeValueItem {
  id: string;
  code: string;
  label: { es?: string; en?: string };
  colorHex: string | null;
}

/** One attribute as the page sends it. */
export interface AttributeItem {
  id: string;
  code: string;
  name: { es?: string; en?: string };
  display: 'buttons' | 'swatches';
  isFilterable: boolean;
  values: AttributeValueItem[];
}

/** Props of the attribute manager. */
export interface AttributeManagerProps {
  items: AttributeItem[];
  locale: 'es' | 'en';
  labels: AdminLabels;
  errors: Record<string, string>;
}

/** The attribute being edited; a null id means a new one. */
interface Draft {
  id: string | null;
  code: string;
  name: { es: string; en: string };
  display: 'buttons' | 'swatches';
  isFilterable: boolean;
  values: AttributeValueItem[];
}

/** Value used when a value is added: its id is assigned by the server on save. */
const blankValue = (): AttributeValueItem => ({
  id: '',
  code: '',
  label: { es: '', en: '' },
  colorHex: null,
});

/**
 * Attribute editor and list.
 * @param props Attributes, locale, strings and error messages.
 */
export default function AttributeManager(props: AttributeManagerProps) {
  const { items, labels, errors, locale } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Opens the editor with an attribute.
   * @param item Attribute to edit, or null for a new one.
   */
  function edit(item: AttributeItem | null) {
    setMessage('');
    setDraft(
      item
        ? {
            id: item.id,
            code: item.code,
            name: { es: item.name.es ?? '', en: item.name.en ?? '' },
            display: item.display,
            isFilterable: item.isFilterable,
            values: item.values.map((value) => ({
              ...value,
              label: { es: value.label.es ?? '', en: value.label.en ?? '' },
            })),
          }
        : {
            id: null,
            code: '',
            name: { es: '', en: '' },
            display: 'buttons',
            isFilterable: true,
            values: [blankValue()],
          },
    );
  }

  /**
   * Changes one value of the draft.
   * @param index Position of the value.
   * @param change Fields to change; `label` replaces the text of one language.
   */
  function patchValue(
    index: number,
    change: Partial<Omit<AttributeValueItem, 'label'>> & { label?: Partial<{ es: string; en: string }> },
  ) {
    if (!draft) return;
    setDraft({
      ...draft,
      values: draft.values.map((value, position) =>
        position === index ? { ...value, ...change, label: { ...value.label, ...change.label } } : value,
      ),
    });
  }

  /**
   * Moves a value up or down in the list, which is the order the storefront shows.
   * @param index Position of the value.
   * @param step -1 for up, 1 for down.
   */
  function moveValue(index: number, step: -1 | 1) {
    if (!draft) return;
    const target = index + step;
    if (target < 0 || target >= draft.values.length) return;
    const values = [...draft.values];
    [values[index], values[target]] = [
      values[target] as AttributeValueItem,
      values[index] as AttributeValueItem,
    ];
    setDraft({ ...draft, values });
  }

  /**
   * Saves the draft and reloads the page.
   */
  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage('');
    const result = await postJson('/api/admin/attributes', {
      id: draft.id,
      code: draft.code,
      name: draft.name,
      display: draft.display,
      isFilterable: draft.isFilterable,
      position: items.length,
      values: draft.values.map((value) => ({
        id: value.id || null,
        code: value.code,
        label: value.label,
        colorHex: draft.display === 'swatches' ? value.colorHex : null,
      })),
    });
    if (result.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  /**
   * Deletes an attribute after confirmation.
   * @param item Attribute to delete.
   */
  async function remove(item: AttributeItem) {
    if (!window.confirm(labels.attributes.confirmDelete)) return;
    const result = await postJson('/api/admin/attributes/delete', { id: item.id });
    if (result.ok) window.location.reload();
    else setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  return (
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <p class="text-text/70 text-sm">{labels.attributes.hint}</p>
        <button type="button" class={BUTTON_PRIMARY} onClick={() => edit(null)}>
          {labels.attributes.new}
        </button>
      </div>
      {message && (
        <p role="alert" class={ERROR_TEXT}>
          {message}
        </p>
      )}

      {draft && (
        <section class={PANEL} aria-labelledby="attribute-editor">
          <h2 id="attribute-editor" class="text-lg font-semibold">
            {draft.id ? labels.attributes.edit : labels.attributes.new}
          </h2>
          <div class="grid gap-3 sm:grid-cols-3">
            <label class={LABEL}>
              {labels.attributes.code}
              <input
                class={FIELD}
                value={draft.code}
                onInput={(e) => setDraft({ ...draft, code: e.currentTarget.value })}
              />
            </label>
            {(['es', 'en'] as const).map((language) => (
              <label class={LABEL}>
                {`${labels.attributes.name} (${labels.product.languages[language]})`}
                <input
                  class={FIELD}
                  value={draft.name[language]}
                  onInput={(e) =>
                    setDraft({ ...draft, name: { ...draft.name, [language]: e.currentTarget.value } })
                  }
                />
              </label>
            ))}
            <label class={LABEL}>
              {labels.attributes.display}
              <select
                class={FIELD}
                value={draft.display}
                onChange={(e) => setDraft({ ...draft, display: e.currentTarget.value as Draft['display'] })}
              >
                <option value="buttons">{labels.attributes.displayButtons}</option>
                <option value="swatches">{labels.attributes.displaySwatches}</option>
              </select>
            </label>
          </div>
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              class="size-5"
              checked={draft.isFilterable}
              onChange={(e) => setDraft({ ...draft, isFilterable: e.currentTarget.checked })}
            />
            {labels.attributes.filterable}
          </label>

          <div class="flex flex-col gap-3">
            <p class="font-semibold">{labels.attributes.values}</p>
            {draft.values.map((value, index) => (
              <div class="rounded-brand border-text/15 grid gap-2 border p-3 sm:grid-cols-4">
                <label class={LABEL}>
                  {labels.attributes.valueCode}
                  <input
                    class={FIELD}
                    value={value.code}
                    onInput={(e) => patchValue(index, { code: e.currentTarget.value })}
                  />
                </label>
                {(['es', 'en'] as const).map((language) => (
                  <label class={LABEL}>
                    {`${labels.attributes.valueLabel} (${labels.product.languages[language]})`}
                    <input
                      class={FIELD}
                      value={value.label[language] ?? ''}
                      onInput={(e) => patchValue(index, { label: { [language]: e.currentTarget.value } })}
                    />
                  </label>
                ))}
                <div class="flex flex-wrap items-end gap-2">
                  {draft.display === 'swatches' && (
                    <label class={LABEL}>
                      {labels.attributes.colorHex}
                      <input
                        type="color"
                        class="rounded-brand border-text/20 size-11 border"
                        value={value.colorHex ?? '#000000'}
                        onInput={(e) => patchValue(index, { colorHex: e.currentTarget.value })}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    class={BUTTON}
                    disabled={index === 0}
                    onClick={() => moveValue(index, -1)}
                    aria-label={labels.common.moveUp}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    class={BUTTON}
                    disabled={index === draft.values.length - 1}
                    onClick={() => moveValue(index, 1)}
                    aria-label={labels.common.moveDown}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    class={LINK_BUTTON}
                    onClick={() =>
                      setDraft({ ...draft, values: draft.values.filter((_, position) => position !== index) })
                    }
                  >
                    {labels.attributes.removeValue}
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              class={BUTTON}
              onClick={() => setDraft({ ...draft, values: [...draft.values, blankValue()] })}
            >
              {labels.attributes.addValue}
            </button>
          </div>

          <div class="flex flex-wrap gap-2">
            <button type="button" class={BUTTON} onClick={() => setDraft(null)}>
              {labels.common.cancel}
            </button>
            <button type="button" class={`${BUTTON_PRIMARY} ml-auto`} disabled={busy} onClick={save}>
              {busy ? labels.common.submitting : labels.common.save}
            </button>
          </div>
        </section>
      )}

      {items.length === 0 && <p class="text-text/70 text-sm">{labels.attributes.empty}</p>}
      <ul class="rounded-brand bg-surface divide-text/10 divide-y">
        {items.map((item) => (
          <li class="flex flex-wrap items-center gap-2 px-4 py-3">
            <span class="mr-auto">
              <span class="font-semibold">
                {item.name[locale] || item.name.es || item.name.en || item.code}
              </span>
              <span class="text-text/60 ml-2 text-xs">{item.values.length}</span>
            </span>
            <button type="button" class={LINK_BUTTON} onClick={() => edit(item)}>
              {labels.common.edit}
            </button>
            <button type="button" class={LINK_BUTTON} onClick={() => remove(item)}>
              {labels.common.delete}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
