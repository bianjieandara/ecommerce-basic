// New custom page: its address and its titles. A new page starts empty, so the form opens the builder for it.
import { useState } from 'preact/hooks';
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import { sameTextInAllLocales } from '@/domain/shared/localized-text';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON_PRIMARY } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import SchemaControl from '@/ui/admin/schema-form/SchemaControl';

/** Texts of the new-page form. */
export interface NewPageLabels {
  heading: string;
  slug: string;
  title: string;
  create: string;
  creating: string;
  failed: string;
  invalid: string;
  none: string;
}

/** Props of the new-page form. */
export interface NewPageFormProps {
  locale: Locale;
  createUrl: string;
  /** Path of the builder; the new page's id is added to it. */
  editBase: string;
  labels: NewPageLabels;
}

/**
 * Creates a custom page and opens it in the builder.
 * @param props Endpoint, builder path and texts.
 */
export default function NewPageForm(props: NewPageFormProps) {
  const { labels } = props;
  const [values, setValues] = useState<Record<string, unknown>>({ slug: '', title: { es: '', en: '' } });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const fields: FieldDescriptor[] = [
    { name: 'slug', kind: 'text', label: sameTextInAllLocales(labels.slug), required: true, max: 80 },
    { name: 'title', kind: 'localizedText', label: sameTextInAllLocales(labels.title), max: 300 },
  ];

  /** Creates the page; on success the browser moves on to its builder. */
  async function create() {
    setStatus('saving');
    setErrors({});
    const result = await postJson<{ id: string }>(props.createUrl, values);
    if (result.ok) {
      window.location.assign(`${props.editBase}/${result.data.id}`);
      return;
    }
    setStatus('failed');
    // A taken address comes back as CONFLICT without field issues, so the address field is marked here.
    setErrors(
      result.code === 'CONFLICT' ? { slug: labels.invalid } : issueMessages(result.details, labels.invalid),
    );
  }

  return (
    <form
      class="rounded-card border-text/10 bg-background flex flex-col gap-4 border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <h2 class="text-base font-semibold">{labels.heading}</h2>
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
          {status === 'saving' ? labels.creating : labels.create}
        </button>
        {status === 'failed' && (
          <p role="alert" class="text-accent text-sm">
            {labels.failed}
          </p>
        )}
      </div>
    </form>
  );
}
