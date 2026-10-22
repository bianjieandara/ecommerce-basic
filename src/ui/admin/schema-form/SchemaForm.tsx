// Form that edits one set of values described by field definitions and saves them through a JSON endpoint. The server checks
// every value with the schema the storefront reads with; the form only shows the answers.
import { useState } from 'preact/hooks';
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON_PRIMARY } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import SchemaControl, { type MediaChoice } from './SchemaControl';

/** Texts of the form. */
export interface SchemaFormLabels {
  save: string;
  saving: string;
  saved: string;
  failed: string;
  none: string;
  invalid: string;
}

/** Props of the schema form. */
export interface SchemaFormProps {
  fields: FieldDescriptor[];
  values: Record<string, unknown>;
  locale: Locale;
  /** Endpoint that receives `{ values }` and answers with the saved values or the field issues. */
  saveUrl: string;
  media: MediaChoice[];
  labels: SchemaFormLabels;
}

/**
 * The form. Saving sends every value, so the server validates the whole group at once.
 * @param props Fields, current values and the endpoint to save to.
 */
export default function SchemaForm(props: SchemaFormProps) {
  const [values, setValues] = useState(props.values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  /** Sends the values and shows the answer. */
  async function save() {
    setStatus('saving');
    setErrors({});
    const result = await postJson<unknown>(props.saveUrl, { values });
    if (result.ok) {
      setStatus('saved');
      return;
    }
    setStatus('failed');
    setErrors(issueMessages(result.details, props.labels.invalid));
  }

  return (
    <form
      class="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {props.fields.map((field) => (
        <SchemaControl
          key={field.name}
          field={field}
          path={field.name}
          value={values[field.name]}
          locale={props.locale}
          media={props.media}
          labels={{ none: props.labels.none, invalid: props.labels.invalid }}
          errors={errors}
          onChange={(value) => {
            setStatus('idle');
            setValues((current) => ({ ...current, [field.name]: value }));
          }}
        />
      ))}
      <div class="flex flex-wrap items-center gap-3">
        <button type="submit" class={BUTTON_PRIMARY} disabled={status === 'saving'}>
          {status === 'saving' ? props.labels.saving : props.labels.save}
        </button>
        <p role="status" class="text-sm">
          {status === 'saved' ? props.labels.saved : status === 'failed' ? props.labels.failed : ''}
        </p>
      </div>
    </form>
  );
}
