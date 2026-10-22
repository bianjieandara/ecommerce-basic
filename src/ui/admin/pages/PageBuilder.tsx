// Page builder (Preact island): the page's texts and publication, and its sections in order. Saving sends the whole page;
// the server checks every section against its widget, and the builder shows each refusal at its control.
import { useState } from 'preact/hooks';
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import { pickText, sameTextInAllLocales, type LocalizedText } from '@/domain/shared/localized-text';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON, BUTTON_PRIMARY, FIELD, HEADING, LABEL, LINK_BUTTON, PANEL } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import type { MediaChoice } from '@/ui/admin/schema-form/SchemaControl';
import SchemaControl from '@/ui/admin/schema-form/SchemaControl';
import { completeSection } from './complete-section';
import SectionEditor, { type SectionEditorLabels, type SectionValue } from './SectionEditor';

/** A widget the builder can add, with its fields and the settings a new section starts with. */
export interface WidgetChoice {
  type: string;
  label: LocalizedText;
  fields: FieldDescriptor[];
  defaults: Record<string, unknown>;
}

/** The page as the builder receives it. */
export interface PageValue {
  id: string;
  slug: string;
  kind: 'system' | 'custom';
  title: LocalizedText;
  seoTitle: Partial<LocalizedText>;
  seoDescription: Partial<LocalizedText>;
  isPublished: boolean;
  sections: SectionValue[];
}

/** Texts of the builder. */
export interface PageBuilderLabels extends SectionEditorLabels {
  pageFields: string;
  pageTitle: string;
  seoTitle: string;
  seoDescription: string;
  published: string;
  systemPage: string;
  sections: string;
  noSections: string;
  addSection: string;
  addButton: string;
  preview: string;
  delete: string;
  confirmDelete: string;
  confirmRemove: string;
  deleteFailed: string;
  save: string;
  saving: string;
  saved: string;
  failed: string;
  invalid: string;
}

/** Props of the page builder. */
export interface PageBuilderProps {
  page: PageValue;
  widgets: WidgetChoice[];
  media: MediaChoice[];
  locale: Locale;
  saveUrl: string;
  deleteUrl: string;
  backHref: string;
  previewHref: string;
  labels: PageBuilderLabels;
}

/**
 * A section id that is unique within the page. The server needs it unique and short, not random.
 * @returns The id.
 */
function newSectionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Moves one item of a list by one place. The list is returned unchanged at either end.
 * @param list Items in order.
 * @param index Position of the item to move.
 * @param step -1 to move up, 1 to move down.
 * @returns The list in its new order.
 */
function moved<T>(list: T[], index: number, step: -1 | 1): T[] {
  const target = index + step;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  if (item === undefined) return list;
  next.splice(target, 0, item);
  return next;
}

/**
 * The page builder.
 * @param props The page, its widgets and the texts.
 */
export default function PageBuilder(props: PageBuilderProps) {
  const { labels } = props;
  // A page without SEO texts stores {}, but the save wants both languages, so the builder starts them empty.
  const [meta, setMeta] = useState<Record<string, unknown>>({
    title: props.page.title,
    seoTitle: { es: '', en: '', ...props.page.seoTitle },
    seoDescription: { es: '', en: '', ...props.page.seoDescription },
    isPublished: props.page.isPublished,
  });
  const [sections, setSections] = useState<SectionValue[]>(() =>
    props.page.sections.map((section) => completeSection(section, props.widgets)),
  );
  const [widgetType, setWidgetType] = useState(props.widgets[0]?.type ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const textFields: FieldDescriptor[] = [
    {
      name: 'title',
      kind: 'localizedText',
      label: sameTextInAllLocales(labels.pageTitle),
      required: true,
      max: 300,
    },
    { name: 'seoTitle', kind: 'localizedText', label: sameTextInAllLocales(labels.seoTitle), max: 300 },
    {
      name: 'seoDescription',
      kind: 'localizedTextarea',
      label: sameTextInAllLocales(labels.seoDescription),
      max: 300,
    },
  ];

  /**
   * Stores a change and forgets the last answer, so the status line never describes an older version.
   * @param next The new sections.
   */
  function changeSections(next: SectionValue[]) {
    setStatus('idle');
    setSections(next);
  }

  /** Sends the whole page and shows the answer. */
  async function save() {
    setStatus('saving');
    setErrors({});
    const result = await postJson<unknown>(props.saveUrl, { ...meta, sections });
    if (result.ok) {
      setStatus('saved');
      return;
    }
    setStatus('failed');
    setErrors(issueMessages(result.details, labels.invalid));
  }

  /** Deletes a custom page after the admin confirms, then returns to the list. */
  async function removePage() {
    if (!window.confirm(labels.confirmDelete)) return;
    const result = await postJson<unknown>(props.deleteUrl, {});
    if (result.ok) window.location.assign(props.backHref);
    else window.alert(labels.deleteFailed);
  }

  /** Adds a section of the chosen widget, with the widget's default settings. */
  function addSection() {
    const widget = props.widgets.find((item) => item.type === widgetType);
    if (!widget) return;
    changeSections([
      ...sections,
      { id: newSectionId(), type: widget.type, enabled: true, config: structuredClone(widget.defaults) },
    ]);
  }

  /**
   * Copies a section and places the copy right after it.
   * @param index Position of the section to copy.
   */
  function duplicateSection(index: number) {
    const original = sections[index];
    if (!original) return;
    const copy: SectionValue = { ...original, id: newSectionId(), config: structuredClone(original.config) };
    changeSections([...sections.slice(0, index + 1), copy, ...sections.slice(index + 1)]);
  }

  /**
   * Removes a section after the admin confirms.
   * @param index Position of the section.
   */
  function removeSection(index: number) {
    if (!window.confirm(labels.confirmRemove)) return;
    changeSections(sections.filter((_, position) => position !== index));
  }

  return (
    <form
      class="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {props.page.kind === 'system' && <p class="text-text/70 text-sm">{labels.systemPage}</p>}
      <section class={PANEL} aria-label={labels.pageFields}>
        <h2 class={HEADING}>{labels.pageFields}</h2>
        {textFields.map((field) => (
          <SchemaControl
            key={field.name}
            field={field}
            path={field.name}
            value={meta[field.name]}
            locale={props.locale}
            media={props.media}
            labels={{ none: labels.none, invalid: labels.invalid }}
            errors={errors}
            onChange={(value) => {
              setStatus('idle');
              setMeta((current) => ({ ...current, [field.name]: value }));
            }}
          />
        ))}
        <label class="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            class="size-5"
            checked={meta.isPublished === true}
            onChange={(event) => {
              setStatus('idle');
              setMeta((current) => ({ ...current, isPublished: event.currentTarget.checked }));
            }}
          />
          {labels.published}
        </label>
      </section>

      <section class="flex flex-col gap-3" aria-label={labels.sections}>
        <h2 class={HEADING}>{labels.sections}</h2>
        {sections.length === 0 && <p class="text-text/70 text-sm">{labels.noSections}</p>}
        {sections.map((section, index) => (
          <SectionEditor
            key={section.id}
            section={section}
            index={index}
            count={sections.length}
            widget={props.widgets.find((item) => item.type === section.type)}
            locale={props.locale}
            media={props.media}
            errors={errors}
            labels={labels}
            onChange={(next) =>
              changeSections(sections.map((item, position) => (position === index ? next : item)))
            }
            onMove={(step) => changeSections(moved(sections, index, step))}
            onDuplicate={() => duplicateSection(index)}
            onRemove={() => removeSection(index)}
          />
        ))}
        <div class="flex flex-wrap items-end gap-2">
          <label class={`${LABEL} min-w-0 flex-1`}>
            {labels.addSection}
            <select
              class={FIELD}
              value={widgetType}
              onChange={(event) => setWidgetType(event.currentTarget.value)}
            >
              {props.widgets.map((widget) => (
                <option value={widget.type} key={widget.type}>
                  {pickText(widget.label, props.locale, 'es')}
                </option>
              ))}
            </select>
          </label>
          <button type="button" class={BUTTON} disabled={!widgetType} onClick={addSection}>
            {labels.addButton}
          </button>
        </div>
      </section>

      <div class="border-text/10 flex flex-wrap items-center gap-3 border-t pt-4">
        <button type="submit" class={BUTTON_PRIMARY} disabled={status === 'saving'}>
          {status === 'saving' ? labels.saving : labels.save}
        </button>
        <a href={props.previewHref} class={LINK_BUTTON} target="_blank" rel="noopener noreferrer">
          {labels.preview}
        </a>
        {props.page.kind === 'custom' && (
          <button type="button" class={BUTTON} onClick={() => void removePage()}>
            {labels.delete}
          </button>
        )}
        <p role="status" class="text-sm">
          {status === 'saved' ? labels.saved : status === 'failed' ? labels.failed : ''}
        </p>
      </div>
    </form>
  );
}
