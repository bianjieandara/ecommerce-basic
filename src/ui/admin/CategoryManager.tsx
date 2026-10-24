// Category manager: the tree with reordering among siblings, and an inline editor for names, slugs and parents.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { orderTree, swappedOrder } from './lib/category-order';
import { BUTTON_PRIMARY, CARD, ERROR_TEXT, LINK_BUTTON } from './lib/classes';
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
    <div class="grid items-start gap-6 lg:grid-cols-[24rem_minmax(0,1fr)]">
      <div class="flex min-w-0 flex-col gap-4">
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
        {rows.length === 0 && <p class="text-text/70 text-sm">{labels.categories.empty}</p>}
        <ul class={`${CARD} divide-text/10 flex flex-col divide-y overflow-hidden`}>
          {rows.map(({ item, depth }, index) => (
            <li
              class={`flex items-center gap-1 pr-2 ${draft?.id === item.id ? 'bg-surface' : ''}`}
              style={{ paddingLeft: `${0.5 + depth * 1.25}rem` }}
            >
              <button
                type="button"
                class="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left font-semibold"
                aria-current={draft?.id === item.id ? 'true' : undefined}
                onClick={() => edit(item)}
              >
                <span class="truncate">{nameOf(item) || '—'}</span>
                {!item.isActive && (
                  <span class="text-text/70 text-xs font-normal">{labels.categories.inactive}</span>
                )}
              </button>
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
              <button type="button" class={LINK_BUTTON} onClick={() => remove(item)}>
                {labels.common.delete}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div class="min-w-0 lg:sticky lg:top-24">
        {draft ? (
          <CategoryEditor
            draft={draft}
            setDraft={setDraft}
            parents={parents}
            labels={labels}
            busy={busy}
            onSave={save}
            onCancel={() => setDraft(null)}
          />
        ) : (
          <p class={`${CARD} text-text/70 p-6 text-sm`}>{labels.categories.hint}</p>
        )}
      </div>
    </div>
  );
}
