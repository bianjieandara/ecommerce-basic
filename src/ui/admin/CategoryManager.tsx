// Category manager: the tree with reordering among siblings, and an inline editor for names, slugs and parents.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { orderTree, swappedOrder } from './lib/category-order';
import { ERROR_TEXT, LINK_BUTTON, BUTTON_PRIMARY } from './lib/classes';
import CategoryEditor from './CategoryEditor';
import { EMPTY_TEXT, type CategoryDraft, type CategoryItem } from './category-types';
import type { AdminLabels } from './ProductFields';

/** Props of the category manager. */
export interface CategoryManagerProps {
  items: CategoryItem[];
  locale: 'es' | 'en';
  labels: AdminLabels;
  errors: Record<string, string>;
}

/**
 * Category tree with its editor.
 * @param props Categories, locale, strings and error messages.
 */
export default function CategoryManager(props: CategoryManagerProps) {
  const { items, labels, errors } = props;
  const [draft, setDraft] = useState<CategoryDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Name of a category in the admin's language, falling back to the other one.
   * @param item Category.
   * @returns The name.
   */
  function nameOf(item: CategoryItem): string {
    return (
      item.translations[props.locale]?.name || item.translations.es?.name || item.translations.en?.name || ''
    );
  }

  /**
   * Opens the editor with a category's text.
   * @param item Category to edit, or null for a new one.
   */
  function edit(item: CategoryItem | null) {
    setMessage('');
    setDraft(
      item
        ? {
            id: item.id,
            parentId: item.parentId,
            isActive: item.isActive,
            translations: { es: item.translations.es ?? EMPTY_TEXT, en: item.translations.en ?? EMPTY_TEXT },
          }
        : { id: null, parentId: null, isActive: true, translations: { es: EMPTY_TEXT, en: EMPTY_TEXT } },
    );
  }

  /**
   * Saves the draft and reloads the page, so the tree shows the stored order.
   */
  async function save() {
    if (!draft) return;
    setBusy(true);
    setMessage('');
    const result = await postJson('/api/admin/categories', {
      id: draft.id,
      parentId: draft.parentId,
      imageMediaId: null,
      isActive: draft.isActive,
      position: null,
      translations: draft.translations,
    });
    if (result.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  /**
   * Deletes a category after confirmation.
   * @param item Category to delete.
   */
  async function remove(item: CategoryItem) {
    if (!window.confirm(labels.categories.confirmDelete)) return;
    const result = await postJson('/api/admin/categories/delete', { id: item.id });
    if (result.ok) window.location.reload();
    else setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  /**
   * Moves a category among its siblings.
   * @param item Category to move.
   * @param step -1 for up, 1 for down.
   */
  async function move(item: CategoryItem, step: -1 | 1) {
    const ids = swappedOrder(items, item.id, step);
    if (!ids) return;
    const result = await postJson('/api/admin/categories/reorder', { ids });
    if (result.ok) window.location.reload();
    else setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  const rows = orderTree(items);
  const parents = draft
    ? rows
        .filter(({ item }) => item.id !== draft.id)
        .map(({ item, depth }) => ({ id: item.id, label: nameOf(item), depth }))
    : [];
  return (
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <p class="text-text/70 text-sm">{labels.categories.hint}</p>
        <button type="button" class={BUTTON_PRIMARY} onClick={() => edit(null)}>
          {labels.categories.new}
        </button>
      </div>
      {message && (
        <p role="alert" class={ERROR_TEXT}>
          {message}
        </p>
      )}

      {draft && (
        <CategoryEditor
          draft={draft}
          setDraft={setDraft}
          parents={parents}
          labels={labels}
          busy={busy}
          onSave={save}
          onCancel={() => setDraft(null)}
        />
      )}

      {rows.length === 0 && <p class="text-text/70 text-sm">{labels.categories.empty}</p>}
      <ul class="rounded-brand bg-surface divide-text/10 flex flex-col divide-y">
        {rows.map(({ item, depth }, index) => (
          <li
            class="flex flex-wrap items-center gap-2 px-4 py-2"
            style={{ paddingLeft: `${1 + depth * 1.25}rem` }}
          >
            <span class="mr-auto font-semibold">{nameOf(item) || '—'}</span>
            {!item.isActive && <span class="text-text/60 text-xs">{labels.categories.inactive}</span>}
            <button
              type="button"
              class={LINK_BUTTON}
              disabled={index === 0}
              aria-label={labels.common.moveUp}
              onClick={() => move(item, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              class={LINK_BUTTON}
              disabled={index === rows.length - 1}
              aria-label={labels.common.moveDown}
              onClick={() => move(item, 1)}
            >
              ↓
            </button>
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
