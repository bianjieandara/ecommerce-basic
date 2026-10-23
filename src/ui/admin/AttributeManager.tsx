// Attribute manager: attributes such as Size or Color, each with its ordered values. A value a variant uses cannot be
// removed; the server says so, and the editor shows the message.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { BUTTON_PRIMARY, ERROR_TEXT, LINK_BUTTON } from './lib/classes';
import AttributeEditor from './AttributeEditor';
import { blankValue, type AttributeDraft, type AttributeItem } from './attribute-types';
import type { AdminLabels } from './ProductFields';

/** Props of the attribute manager. */
export interface AttributeManagerProps {
  items: AttributeItem[];
  locale: 'es' | 'en';
  labels: AdminLabels;
  errors: Record<string, string>;
}

/**
 * Attribute list with its editor.
 * @param props Attributes, locale, strings and error messages.
 */
export default function AttributeManager(props: AttributeManagerProps) {
  const { items, labels, errors, locale } = props;
  const [draft, setDraft] = useState<AttributeDraft | null>(null);
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
        <AttributeEditor
          draft={draft}
          setDraft={setDraft}
          labels={labels}
          busy={busy}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      )}

      {items.length === 0 && <p class="text-text/70 text-sm">{labels.attributes.empty}</p>}
      <ul class="rounded-brand bg-surface divide-text/10 divide-y">
        {items.map((item) => (
          <li class="flex flex-wrap items-center gap-2 px-4 py-3">
            <span class="mr-auto">
              <span class="font-semibold">
                {item.name[locale] || item.name.es || item.name.en || item.code}
              </span>
              <span class="text-text/70 ml-2 text-xs">{item.values.length}</span>
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
