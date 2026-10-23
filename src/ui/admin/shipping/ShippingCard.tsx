// One shipping method as a card: its fields, a Save that posts this method alone, and Delete for a stored method. A new method's
// card reloads the page after it saves, so the list and the new id come from the server.
import { useState } from 'preact/hooks';
import type { FieldDescriptor } from '@/application/forms/field-descriptor';
import type { ShippingMethodRecord } from '@/application/ports/ordering';
import type { Locale } from '@/domain/shared/locale';
import { pickText } from '@/domain/shared/localized-text';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, PANEL } from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import SchemaControl from '@/ui/admin/schema-form/SchemaControl';
import { draftOf, requestOf, type ShippingDraft } from './shipping-draft';

/** Texts of one card. */
export interface ShippingLabels {
  save: string;
  saving: string;
  saved: string;
  failed: string;
  none: string;
  invalid: string;
  delete: string;
  confirmDelete: string;
  addMethod: string;
  untitled: string;
  inactive: string;
  price: string;
  priceHint: string;
  freeOver: string;
  freeOverHint: string;
  pickupNote: string;
}

/** Props of one card. */
export interface ShippingCardProps {
  /** The stored method, or null for the card that adds one. */
  method: ShippingMethodRecord | null;
  nextPosition: number;
  exponent: number;
  locale: Locale;
  fields: FieldDescriptor[];
  labels: ShippingLabels;
  /** Messages of the answers the server gives, by code (the errors dictionary). */
  errorTexts: Record<string, string>;
}

/** Amount field: a text input for the major-unit price, with its hint and the server's refusal. */
function AmountField(props: {
  label: string;
  hint: string;
  value: string;
  error?: string;
  onInput: (value: string) => void;
}) {
  return (
    <div class="flex flex-col gap-1">
      <label class={LABEL}>
        {props.label}
        <input
          type="text"
          inputMode="decimal"
          class={FIELD}
          value={props.value}
          onInput={(event) => props.onInput(event.currentTarget.value)}
        />
      </label>
      <p class="text-text/70 text-xs">{props.hint}</p>
      {props.error && <p class={ERROR_TEXT}>{props.error}</p>}
    </div>
  );
}

/**
 * One shipping method's card.
 * @param props Stored method (or none), fields, texts and the server's answers.
 */
export default function ShippingCard(props: ShippingCardProps) {
  const { method, exponent, locale, fields, labels, errorTexts } = props;
  const [draft, setDraft] = useState<ShippingDraft>(() => draftOf(method, props.nextPosition, exponent));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [message, setMessage] = useState('');
  const values: Record<string, unknown> = draft;
  const pickup = draft.kind === 'pickup';
  const title = draft.id === null ? labels.addMethod : pickText(draft.name, locale, 'es') || labels.untitled;

  /**
   * Edits one field of the draft and clears the status of the last save.
   * @param name Field name, the draft's key.
   * @param value New value from the control.
   */
  function change(name: string, value: unknown) {
    setStatus('idle');
    setDraft((current) => ({ ...current, [name]: value }) as ShippingDraft);
  }

  /** Posts this method. A refusal keeps the draft and marks the fields the server named. */
  async function save() {
    setStatus('saving');
    setErrors({});
    const result = await postJson<{ id: string }>('/api/admin/shipping', requestOf(draft, exponent));
    if (result.ok) {
      // A new method needs its id and its place in the list, both from the server.
      if (draft.id === null) window.location.reload();
      else setStatus('saved');
      return;
    }
    setErrors(issueMessages(result.details, labels.invalid));
    setMessage(errorTexts[result.code] ?? labels.failed);
    setStatus('failed');
  }

  /** Deletes this method after confirmation. */
  async function remove() {
    if (draft.id === null || !window.confirm(labels.confirmDelete)) return;
    setStatus('saving');
    const result = await postJson(`/api/admin/shipping/${encodeURIComponent(draft.id)}/delete`, {});
    if (result.ok) {
      window.location.reload();
      return;
    }
    setMessage(errorTexts[result.code] ?? labels.failed);
    setStatus('failed');
  }

  return (
    <section class={PANEL} aria-label={title}>
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-base font-semibold wrap-break-word">{title}</h2>
        {!draft.isActive && <span class="text-text/70 text-xs">{labels.inactive}</span>}
      </header>
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
            locale={locale}
            media={[]}
            labels={{ none: labels.none, invalid: labels.invalid }}
            errors={errors}
            onChange={(value) => change(field.name, value)}
          />
        ))}
        {pickup ? (
          <p class="text-text/70 text-sm">{labels.pickupNote}</p>
        ) : (
          <>
            <AmountField
              label={labels.price}
              hint={labels.priceHint}
              value={draft.price}
              error={errors.priceMinor}
              onInput={(value) => change('price', value)}
            />
            <AmountField
              label={labels.freeOver}
              hint={labels.freeOverHint}
              value={draft.freeOver}
              error={errors.freeOverMinor}
              onInput={(value) => change('freeOver', value)}
            />
          </>
        )}
        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class={BUTTON_PRIMARY} disabled={status === 'saving'}>
            {status === 'saving' ? labels.saving : labels.save}
          </button>
          {draft.id !== null && (
            <button type="button" class={BUTTON} disabled={status === 'saving'} onClick={() => void remove()}>
              {labels.delete}
            </button>
          )}
          <p role="status" class="text-sm">
            {status === 'saved' ? labels.saved : ''}
          </p>
        </div>
        {status === 'failed' && (
          <p role="alert" class={ERROR_TEXT}>
            {message}
          </p>
        )}
      </form>
    </section>
  );
}
