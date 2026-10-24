// One section of the page builder: its widget, whether it is shown, its place in the list, and its settings when opened.
// The settings are the widget's own fields, so the form is built from the widget definition.
import { useState } from 'preact/hooks';
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import { pickText, type LocalizedText } from '@/domain/shared/localized-text';
import type { Locale } from '@/domain/shared/locale';
import { BUTTON, STEP_BUTTON } from '@/ui/admin/lib/classes';
import SchemaControl, { type MediaChoice } from '@/ui/admin/schema-form/SchemaControl';

/** A section as the builder holds it. */
export interface SectionValue {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** Texts of one section row. */
export interface SectionEditorLabels {
  shown: string;
  edit: string;
  close: string;
  moveUp: string;
  moveDown: string;
  duplicate: string;
  remove: string;
  unknown: string;
  none: string;
  invalid: string;
}

/** Props of one section row. */
export interface SectionEditorProps {
  section: SectionValue;
  index: number;
  count: number;
  /** The widget the section uses; absent when the registry no longer knows its type. */
  widget?: { label: LocalizedText; fields: FieldDescriptor[] };
  locale: Locale;
  media: MediaChoice[];
  errors: Record<string, string>;
  labels: SectionEditorLabels;
  onChange: (section: SectionValue) => void;
  onMove: (step: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

/**
 * Renders one section with its controls. The settings open below the row.
 * @param props Section, its widget and the actions on it.
 */
export default function SectionEditor(props: SectionEditorProps) {
  const { section, widget, labels } = props;
  const [open, setOpen] = useState(false);
  const name = widget ? pickText(widget.label, props.locale, 'es') : `${labels.unknown}: ${section.type}`;

  return (
    <article class="rounded-card border-text/10 bg-background flex flex-col gap-3 border p-3">
      <div class="flex flex-wrap items-center gap-2">
        <label class="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            class="size-5"
            checked={section.enabled}
            aria-label={labels.shown}
            onChange={(event) => props.onChange({ ...section, enabled: event.currentTarget.checked })}
          />
          {name}
        </label>
        <div class="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            class={STEP_BUTTON}
            aria-label={labels.moveUp}
            disabled={props.index === 0}
            onClick={() => props.onMove(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            class={STEP_BUTTON}
            aria-label={labels.moveDown}
            disabled={props.index === props.count - 1}
            onClick={() => props.onMove(1)}
          >
            ↓
          </button>
          {widget && (
            <button type="button" class={BUTTON} aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? labels.close : labels.edit}
            </button>
          )}
          <button type="button" class={BUTTON} onClick={props.onDuplicate}>
            {labels.duplicate}
          </button>
          <button type="button" class={BUTTON} onClick={props.onRemove}>
            {labels.remove}
          </button>
        </div>
      </div>
      {open && widget && (
        <div class="border-text/10 flex flex-col gap-4 border-t pt-3">
          {widget.fields.map((field) => (
            <SchemaControl
              key={field.name}
              field={field}
              path={`sections.${props.index}.config.${field.name}`}
              value={section.config[field.name]}
              locale={props.locale}
              media={props.media}
              labels={{ none: labels.none, invalid: labels.invalid }}
              errors={props.errors}
              onChange={(value) =>
                props.onChange({ ...section, config: { ...section.config, [field.name]: value } })
              }
            />
          ))}
        </div>
      )}
    </article>
  );
}
