// One field of a schema form. It renders the control for the field's kind and reports each change with the value the schema
// expects: an empty choice of a nullable field becomes null, and an object field holds its nested values.
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import { pickText, type LocalizedText } from '@/domain/shared/localized-text';
import type { Locale } from '@/domain/shared/locale';
import { FIELD, LABEL } from '@/ui/admin/lib/classes';
import { refused, Shell } from './field-shell';
import LocalizedControl from './LocalizedControl';

/** One image offered by an image field. */
export interface MediaChoice {
  id: string;
  label: string;
}

/** Texts a control shows that do not come from the field. */
export interface SchemaControlLabels {
  /** Text of the empty choice of a select or an image field. */
  none: string;
  /** Message shown under a field the server refused. */
  invalid: string;
}

/** Props of one schema control. */
export interface SchemaControlProps {
  field: FieldDescriptor;
  /** Dotted path of the field from the form root, the key the server uses in its issues. */
  path: string;
  value: unknown;
  locale: Locale;
  media: MediaChoice[];
  labels: SchemaControlLabels;
  /** Messages of the fields the server refused, by path. */
  errors: Record<string, string>;
  onChange: (value: unknown) => void;
}

/**
 * Renders one field of a form.
 * @param props Field, value and change handler.
 * @returns The control.
 */
export default function SchemaControl(props: SchemaControlProps) {
  const { field, path, value, locale, media, labels, errors, onChange } = props;
  const label = pickText(field.label, locale, 'es');
  const error = refused(errors, path) ? labels.invalid : undefined;
  const text = value === null || value === undefined ? '' : String(value);

  switch (field.kind) {
    case 'text':
    case 'url':
    case 'email':
    case 'tel':
    case 'color':
      return (
        <Shell error={error}>
          <label class={LABEL}>
            {label}
            {field.kind === 'color' ? (
              <input
                type="color"
                class="h-11 w-20"
                value={text}
                onInput={(event) => onChange(event.currentTarget.value)}
              />
            ) : (
              // The server checks the format; the keyboard hint is what a phone needs.
              <input
                type="text"
                inputMode={field.kind === 'text' ? undefined : field.kind}
                class={FIELD}
                value={text}
                maxLength={field.max}
                onInput={(event) => onChange(event.currentTarget.value)}
              />
            )}
          </label>
        </Shell>
      );
    case 'textarea':
      return (
        <Shell error={error}>
          <label class={LABEL}>
            {label}
            <textarea
              rows={3}
              class={FIELD}
              value={text}
              maxLength={field.max}
              onInput={(event) => onChange(event.currentTarget.value)}
            />
          </label>
        </Shell>
      );
    case 'localizedText':
    case 'localizedTextarea':
    case 'localizedMarkdown':
      return (
        <Shell error={error}>
          <LocalizedControl
            label={label}
            multiline={field.kind !== 'localizedText'}
            texts={(value ?? {}) as Partial<LocalizedText>}
            locale={locale}
            onChange={onChange}
          />
        </Shell>
      );
    case 'number':
      return (
        <Shell error={error}>
          <label class={LABEL}>
            {label}
            <input
              type="number"
              inputMode="decimal"
              class={FIELD}
              value={text}
              min={field.min}
              max={field.max}
              step={field.step}
              onInput={(event) => {
                const raw = event.currentTarget.value;
                // An empty box is sent as null: the server refuses it for a required number instead of storing 0.
                onChange(raw === '' ? null : Number(raw));
              }}
            />
          </label>
        </Shell>
      );
    case 'boolean':
      return (
        <Shell error={error}>
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              class="size-5"
              checked={value === true}
              onChange={(event) => onChange(event.currentTarget.checked)}
            />
            {label}
          </label>
        </Shell>
      );
    case 'select':
      return (
        <Shell error={error}>
          <label class={LABEL}>
            {label}
            <select
              class={FIELD}
              value={text}
              onChange={(event) => {
                const raw = event.currentTarget.value;
                onChange(raw === '' && field.nullable ? null : raw);
              }}
            >
              {field.nullable && <option value="">{labels.none}</option>}
              {field.options.map((choice) => (
                <option value={choice.value} key={choice.value}>
                  {pickText(choice.label, locale, 'es')}
                </option>
              ))}
            </select>
          </label>
        </Shell>
      );
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Shell error={error}>
          <fieldset class="flex flex-col gap-1 text-sm">
            <legend class="mb-1 font-semibold">{label}</legend>
            {field.options.map((choice) => (
              <label class="flex min-h-11 items-center gap-3" key={choice.value}>
                <input
                  type="checkbox"
                  class="size-5"
                  checked={selected.includes(choice.value)}
                  onChange={(event) =>
                    onChange(
                      event.currentTarget.checked
                        ? [...selected, choice.value]
                        : selected.filter((item) => item !== choice.value),
                    )
                  }
                />
                {pickText(choice.label, locale, 'es')}
              </label>
            ))}
          </fieldset>
        </Shell>
      );
    }
    case 'image':
      return (
        <Shell error={error}>
          <label class={LABEL}>
            {label}
            <select
              class={FIELD}
              value={text}
              onChange={(event) => onChange(event.currentTarget.value || null)}
            >
              <option value="">{labels.none}</option>
              {media.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </Shell>
      );
    case 'object': {
      const nested = (value ?? {}) as Record<string, unknown>;
      return (
        <fieldset class="rounded-brand border-text/15 flex flex-col gap-3 border p-3">
          <legend class="px-1 text-sm font-semibold">{label}</legend>
          {field.fields.map((child) => (
            <SchemaControl
              {...props}
              key={child.name}
              field={child}
              path={`${path}.${child.name}`}
              value={nested[child.name]}
              onChange={(next) => onChange({ ...nested, [child.name]: next })}
            />
          ))}
        </fieldset>
      );
    }
    default:
      // The list kinds (repeater, product and category lists, links) are not used by the settings forms yet.
      return null;
  }
}
