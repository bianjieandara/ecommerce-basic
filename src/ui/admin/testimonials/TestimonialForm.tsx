// One testimonial's form. The add form and each item's edit form share it; server refusals show at their control by path.
import { useState } from 'preact/hooks';
import type { FieldDescriptor, FieldOption } from '@/application/forms/field-descriptor';
import type { Testimonial } from '@/application/ports/content';
import { sameTextInAllLocales } from '@/domain/shared/localized-text';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import SchemaControl from '@/ui/admin/schema-form/SchemaControl';

/** Texts of the testimonial screens, all translated by the page. */
export interface TestimonialLabels {
  add: string;
  edit: string;
  close: string;
  authorName: string;
  rating: string;
  body: string;
  locale: string;
  visible: string;
  position: string;
  shown: string;
  hidden: string;
  empty: string;
  save: string;
  saving: string;
  delete: string;
  confirmDelete: string;
  failed: string;
  invalid: string;
  none: string;
}

/** Props of the testimonial form. */
export interface TestimonialFormProps {
  /** The testimonial being edited, or null for the add form. */
  initial: Testimonial | null;
  /** Language of the admin screen, used for labels. */
  locale: Locale;
  /** Language a new testimonial starts in. */
  defaultLocale: Locale;
  /** Endpoint that saves the testimonial (the id travels in the body). */
  saveUrl: string;
  /** Endpoint that deletes the testimonial; null on the add form. */
  deleteUrl: string | null;
  ratingOptions: FieldOption[];
  localeOptions: FieldOption[];
  labels: TestimonialLabels;
  /** Called with the saved testimonial; `wasNew` tells the list whether to add it or replace the row. */
  onSaved: (saved: Testimonial, wasNew: boolean) => void;
  onDeleted?: (id: string) => void;
}

/**
 * The testimonial form: author, rating, text, language, visibility and position.
 * @param props Testimonial, endpoints, options and texts.
 */
export default function TestimonialForm(props: TestimonialFormProps) {
  const { initial, labels } = props;
  const [values, setValues] = useState<Record<string, unknown>>(() => ({
    authorName: initial?.authorName ?? '',
    rating: String(initial?.rating ?? 5),
    body: initial?.body ?? '',
    locale: initial?.locale ?? props.defaultLocale,
    isVisible: initial?.isVisible ?? true,
    position: initial?.position ?? 0,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const fields: FieldDescriptor[] = [
    {
      name: 'authorName',
      kind: 'text',
      label: sameTextInAllLocales(labels.authorName),
      required: true,
      max: 80,
    },
    {
      name: 'rating',
      kind: 'select',
      label: sameTextInAllLocales(labels.rating),
      options: props.ratingOptions,
    },
    { name: 'body', kind: 'textarea', label: sameTextInAllLocales(labels.body), required: true, max: 1000 },
    {
      name: 'locale',
      kind: 'select',
      label: sameTextInAllLocales(labels.locale),
      options: props.localeOptions,
    },
    { name: 'isVisible', kind: 'boolean', label: sameTextInAllLocales(labels.visible) },
    { name: 'position', kind: 'number', label: sameTextInAllLocales(labels.position), min: 0, max: 999 },
  ];

  /** Saves the testimonial. Select values arrive as strings, so the rating and the position are converted here. */
  async function save() {
    setStatus('saving');
    setErrors({});
    const fieldsValue = {
      authorName: String(values.authorName),
      rating: Number(values.rating),
      body: String(values.body),
      locale: values.locale as Locale,
      isVisible: values.isVisible === true,
      position: Number(values.position),
    };
    const result = await postJson<{ id: string }>(
      props.saveUrl,
      initial ? { id: initial.id, ...fieldsValue } : fieldsValue,
    );
    if (!result.ok) {
      setStatus('failed');
      setErrors(issueMessages(result.details, labels.invalid));
      return;
    }
    props.onSaved(
      { ...fieldsValue, id: result.data.id, createdAt: initial?.createdAt ?? new Date().toISOString() },
      initial === null,
    );
  }

  /** Deletes the testimonial after the admin confirms. */
  async function remove() {
    if (!initial || !props.deleteUrl || !window.confirm(labels.confirmDelete)) return;
    setStatus('saving');
    const result = await postJson<{ deleted: boolean }>(props.deleteUrl, {});
    if (!result.ok) {
      setStatus('failed');
      return;
    }
    props.onDeleted?.(initial.id);
  }

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {fields.map((field) => (
        <SchemaControl
          key={field.name}
          field={field}
          path={field.name}
          value={values[field.name]}
          locale={props.locale}
          media={[]}
          labels={{ none: labels.none, invalid: labels.invalid }}
          errors={errors}
          onChange={(value) => {
            setStatus('idle');
            setValues((current) => ({ ...current, [field.name]: value }));
          }}
        />
      ))}
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class={BUTTON_PRIMARY} disabled={status === 'saving'}>
          {status === 'saving' ? labels.saving : labels.save}
        </button>
        {initial && props.deleteUrl && (
          <button type="button" class={BUTTON} disabled={status === 'saving'} onClick={() => void remove()}>
            {labels.delete}
          </button>
        )}
        {status === 'failed' && (
          <p role="alert" class={ERROR_TEXT}>
            {labels.failed}
          </p>
        )}
      </div>
    </form>
  );
}
