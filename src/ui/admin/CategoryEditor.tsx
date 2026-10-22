// Category editor: parent, visibility, and the name, slug and description in each language.
import { BUTTON, BUTTON_PRIMARY, FIELD, LABEL, PANEL } from './lib/classes';
import type { CategoryDraft, CategoryText } from './category-types';
import type { AdminLabels } from './ProductFields';

/** A category that can be chosen as the parent: its id, its name and its depth in the tree. */
export interface ParentOption {
  id: string;
  label: string;
  depth: number;
}

/** Props of the category editor. */
export interface CategoryEditorProps {
  draft: CategoryDraft;
  setDraft: (draft: CategoryDraft) => void;
  parents: ParentOption[];
  labels: AdminLabels;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/**
 * Editor panel for one category.
 * @param props Draft, parent choices and actions.
 */
export default function CategoryEditor(props: CategoryEditorProps) {
  const { draft, setDraft, parents, labels, busy, onSave, onCancel } = props;

  /**
   * Changes the text of one language.
   * @param language Language.
   * @param change Fields to change.
   */
  function setText(language: 'es' | 'en', change: Partial<CategoryText>) {
    setDraft({
      ...draft,
      translations: { ...draft.translations, [language]: { ...draft.translations[language], ...change } },
    });
  }

  return (
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
          {parents.map((parent) => (
            <option value={parent.id}>{`${'— '.repeat(parent.depth)}${parent.label}`}</option>
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
