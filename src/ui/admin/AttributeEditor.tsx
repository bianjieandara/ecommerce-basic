// Attribute editor: code, names, display, the storefront filter flag, and the ordered list of values.
import { BUTTON, BUTTON_PRIMARY, FIELD, LABEL, LINK_BUTTON, PANEL } from './lib/classes';
import { blankValue, type AttributeDraft, type AttributeValueItem } from './attribute-types';
import type { AdminLabels } from './ProductFields';

/** Props of the attribute editor. */
export interface AttributeEditorProps {
  draft: AttributeDraft;
  setDraft: (draft: AttributeDraft) => void;
  labels: AdminLabels;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Editor for one attribute and its values.
 * @param props Draft, setter, strings and actions.
 */
export default function AttributeEditor(props: AttributeEditorProps) {
  const { draft, setDraft, labels, busy, onSave, onCancel } = props;

  /**
   * Changes one value of the draft.
   * @param index Position of the value.
   * @param change Fields to change; `label` replaces the text of one language.
   */
  function patchValue(
    index: number,
    change: Partial<Omit<AttributeValueItem, 'label'>> & { label?: Partial<{ es: string; en: string }> },
  ) {
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
    const target = index + step;
    if (target < 0 || target >= draft.values.length) return;
    const values = [...draft.values];
    [values[index], values[target]] = [
      values[target] as AttributeValueItem,
      values[index] as AttributeValueItem,
    ];
    setDraft({ ...draft, values });
  }

  return (
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
            onChange={(e) =>
              setDraft({ ...draft, display: e.currentTarget.value as AttributeDraft['display'] })
            }
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
        <button type="button" class={BUTTON} onClick={onCancel}>
          {labels.common.cancel}
        </button>
        <button type="button" class={`${BUTTON_PRIMARY} ml-auto`} disabled={busy} onClick={onSave}>
          {busy ? labels.common.submitting : labels.common.save}
        </button>
      </div>
    </section>
  );
}
