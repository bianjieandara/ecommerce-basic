// Testimonials admin (Preact island): the add form on top, then each testimonial as a row that opens its edit form.
// The list is sorted the way the server sorts it (position, then creation time), so a reload shows the same order.
import { useState } from 'preact/hooks';
import type { FieldOption } from '@/application/forms/field-descriptor';
import type { Testimonial } from '@/application/ports/content';
import type { Locale } from '@/domain/shared/locale';
import { pickText } from '@/domain/shared/localized-text';
import { BADGE, BADGE_TONE, HEADING, LINK_BUTTON, PANEL } from '@/ui/admin/lib/classes';
import TestimonialForm, { type TestimonialLabels } from './TestimonialForm';

/** Characters of the body shown in a row; the full text opens in the edit form. */
const EXCERPT_LENGTH = 140;

/** Props of the testimonial list. */
export interface TestimonialManagerProps {
  items: Testimonial[];
  locale: Locale;
  defaultLocale: Locale;
  /** Path of the save endpoint; the delete endpoint is this path with `/<id>/delete`. */
  apiBase: string;
  ratingOptions: FieldOption[];
  localeOptions: FieldOption[];
  labels: TestimonialLabels;
}

/**
 * Orders testimonials as the server does: position, then creation time, then id.
 * @param list Testimonials in any order.
 * @returns A new, sorted list.
 */
function sortTestimonials(list: Testimonial[]): Testimonial[] {
  return [...list].sort(
    (a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Shortens a body for the row.
 * @param body Full text.
 * @returns The body, cut at EXCERPT_LENGTH with an ellipsis when it is longer.
 */
function excerpt(body: string): string {
  return body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
}

/**
 * The testimonial list with its add form. Only one row is open for editing at a time.
 * @param props Items, languages, endpoint and texts.
 */
export default function TestimonialManager(props: TestimonialManagerProps) {
  const { labels, locale, ratingOptions, localeOptions } = props;
  const [items, setItems] = useState(() => sortTestimonials(props.items));
  const [editingId, setEditingId] = useState<string | null>(null);
  // Changing the key empties the add form again after a save.
  const [addKey, setAddKey] = useState(0);
  const shared = {
    locale,
    defaultLocale: props.defaultLocale,
    saveUrl: props.apiBase,
    ratingOptions,
    localeOptions,
    labels,
  };

  /**
   * Adds a new testimonial to the list, or replaces the edited one, and closes the edit form.
   * @param saved The testimonial as the server stored it.
   * @param wasNew Whether it was created by the add form.
   */
  function handleSaved(saved: Testimonial, wasNew: boolean) {
    setItems((current) =>
      sortTestimonials(
        wasNew ? [...current, saved] : current.map((item) => (item.id === saved.id ? saved : item)),
      ),
    );
    setEditingId(null);
    if (wasNew) setAddKey((key) => key + 1);
  }

  /**
   * Removes a deleted testimonial from the list.
   * @param id Id of the deleted testimonial.
   */
  function handleDeleted(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
    setEditingId(null);
  }

  return (
    <div class="flex flex-col gap-6">
      <section class={PANEL}>
        <h2 class={HEADING}>{labels.add}</h2>
        <TestimonialForm key={addKey} initial={null} deleteUrl={null} onSaved={handleSaved} {...shared} />
      </section>
      {items.length === 0 ? (
        <p class="text-text/70 text-sm">{labels.empty}</p>
      ) : (
        <ul class="flex flex-col gap-3">
          {items.map((item) => {
            const editing = editingId === item.id;
            const rating = pickText(ratingOptions[item.rating - 1]?.label, locale, 'es');
            const language = pickText(
              localeOptions.find((option) => option.value === item.locale)?.label,
              locale,
              'es',
            );
            return (
              <li key={item.id} class={PANEL}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="flex min-w-0 flex-col gap-1">
                    <span class="font-semibold wrap-break-word">{item.authorName}</span>
                    <span class="text-text/70 flex flex-wrap items-center gap-2 text-sm">
                      <span>{rating}</span>
                      <span>{language}</span>
                      <span class={`${BADGE} ${item.isVisible ? BADGE_TONE.ok : BADGE_TONE.muted}`}>
                        {item.isVisible ? labels.shown : labels.hidden}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    class={LINK_BUTTON}
                    aria-expanded={editing}
                    onClick={() => setEditingId(editing ? null : item.id)}
                  >
                    {editing ? labels.close : labels.edit}
                  </button>
                </div>
                <p class="text-sm wrap-break-word">{excerpt(item.body)}</p>
                {editing && (
                  <TestimonialForm
                    initial={item}
                    deleteUrl={`${props.apiBase}/${item.id}/delete`}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                    {...shared}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
