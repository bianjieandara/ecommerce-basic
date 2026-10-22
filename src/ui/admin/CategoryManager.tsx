// Category manager: the tree with reordering among siblings, and an inline editor for names, slugs and parents.
import { useState } from 'preact/hooks';
import { postJson } from './lib/api-client';
import { orderTree } from './lib/category-order';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, LINK_BUTTON, PANEL } from './lib/classes';
import type { AdminLabels } from './ProductFields';

/** Text of a category in one language. */
export interface CategoryText {
  name: string;
  slug: string;
  description: string;
}

/** One category as the page sends it. */
export interface CategoryItem {
  id: string;
  parentId: string | null;
  position: number;
  isActive: boolean;
  translations: { es?: CategoryText; en?: CategoryText };
}

/** Props of the category manager. */
export interface CategoryManagerProps {
  items: CategoryItem[];
  locale: 'es' | 'en';
  labels: AdminLabels;
  errors: Record<string, string>;
}

/** The category being edited; a null id means a new one. */
interface Draft {
  id: string | null;
  parentId: string | null;
  isActive: boolean;
  translations: { es: CategoryText; en: CategoryText };
}

const EMPTY_TEXT: CategoryText = { name: '', slug: '', description: '' };

/**
 * The full order that results from swapping a category with its neighbour among its siblings.
 * @param items All categories.
 * @param id Category to move.
 * @param step -1 to move up, 1 to move down.
 * @returns Ids in the new display order, or null when the category cannot move that way.
 */
function swappedOrder(items: CategoryItem[], id: string, step: -1 | 1): string[] | null {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return null;
  const siblings = items
    .filter((candidate) => candidate.parentId === item.parentId)
    .sort((a, b) => a.position - b.position);
  const other = siblings[siblings.findIndex((candidate) => candidate.id === id) + step];
  if (!other) return null;
  const positions = new Map(items.map((candidate) => [candidate.id, candidate.position] as const));
  positions.set(item.id, other.position);
  positions.set(other.id, item.position);
  return orderTree(
    items.map((candidate) => ({ ...candidate, position: positions.get(candidate.id) ?? 0 })),
  ).map((entry) => entry.item.id);
}

/**
 * Category tree with its editor.
 * @param props Categories, locale, strings and error messages.
 */
export default function CategoryManager(props: CategoryManagerProps) {
  const { items, labels, errors } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
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
   * Changes the text of one language in the editor.
   * @param language Language.
   * @param change Fields to change.
   */
  function setText(language: 'es' | 'en', change: Partial<CategoryText>) {
    if (!draft) return;
    setDraft({
      ...draft,
      translations: { ...draft.translations, [language]: { ...draft.translations[language], ...change } },
    });
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
        <section class={PANEL} aria-labelledby="category-editor">
          <h2 id="category-editor" class="text-lg font-semibold">
            {draft.id ? labels.categories.edit : labels.categories.new}
          </h2>
          <label class={LABEL}>
            {labels.categories.parent}
            <select
              class={FIELD}
              value={draft.parentId ?? ''}
              onChange={(e) => setDraft({ ...draft, parentId: e.currentTarget.value || null })}
            >
              <option value="">{labels.categories.noParent}</option>
              {rows
                .filter(({ item }) => item.id !== draft.id)
                .map(({ item, depth }) => (
                  <option value={item.id}>{`${'— '.repeat(depth)}${nameOf(item)}`}</option>
                ))}
            </select>
          </label>
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              class="size-5"
              checked={draft.isActive}
              onChange={(e) => setDraft({ ...draft, isActive: e.currentTarget.checked })}
            />
            {labels.categories.active}
          </label>
          {(['es', 'en'] as const).map((language) => (
            <fieldset class="grid gap-3 sm:grid-cols-3">
              <legend class="font-semibold">{labels.product.languages[language]}</legend>
              <label class={LABEL}>
                {labels.categories.name}
                <input
                  class={FIELD}
                  value={draft.translations[language].name}
                  onInput={(e) => setText(language, { name: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.categories.slug}
                <input
                  class={FIELD}
                  placeholder={labels.categories.slugHint}
                  value={draft.translations[language].slug}
                  onInput={(e) => setText(language, { slug: e.currentTarget.value })}
                />
              </label>
              <label class={LABEL}>
                {labels.categories.description}
                <input
                  class={FIELD}
                  value={draft.translations[language].description}
                  onInput={(e) => setText(language, { description: e.currentTarget.value })}
                />
              </label>
            </fieldset>
          ))}
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
