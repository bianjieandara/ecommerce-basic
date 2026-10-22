// Adjustment fields shared by the drawer and the bulk action: add or remove units, or set a counted value, with a reason and an
// optional note. The parent sends the values to the adjust endpoint.
import { useState } from 'preact/hooks';
import { BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL } from '../lib/classes';
import {
  ADJUST_REASONS,
  adjustReasonLabel,
  type AdjustReason,
  type AdjustValues,
  type InventoryLabels,
} from './inventory-view';

/** Props of the adjustment form. */
export interface StockAdjustFormProps {
  labels: InventoryLabels;
  busy: boolean;
  /** Message from the last attempt, shown under the fields. */
  error: string | null;
  onSubmit: (values: AdjustValues) => void;
}

/**
 * The adjustment fields and their submit button. Checks the quantity before it hands the values to the parent.
 * @param props Labels, busy state, last error and the submit handler.
 */
export function StockAdjustForm(props: StockAdjustFormProps) {
  const { labels } = props;
  const [mode, setMode] = useState<AdjustValues['mode']>('delta');
  const [text, setText] = useState('');
  const [reason, setReason] = useState<AdjustReason>('manual_adjust');
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState(false);

  /**
   * Validates the quantity and submits the form when it is a whole number (never negative in "set" mode).
   * @param event Form submit event.
   */
  function submit(event: Event) {
    event.preventDefault();
    const value = Number(text);
    const valid = text.trim() !== '' && Number.isInteger(value) && !(mode === 'set' && value < 0);
    setInvalid(!valid);
    if (valid) props.onSubmit({ mode, value, reason, note: note.trim() || null });
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={submit}>
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm font-semibold">{labels.mode}</legend>
        <label class="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="mode"
            class="size-5"
            checked={mode === 'delta'}
            onChange={() => setMode('delta')}
          />
          {labels.modeDelta}
        </label>
        <label class="flex min-h-11 items-center gap-3 text-sm">
          <input
            type="radio"
            name="mode"
            class="size-5"
            checked={mode === 'set'}
            onChange={() => setMode('set')}
          />
          {labels.modeSet}
        </label>
      </fieldset>
      <label class={LABEL}>
        {labels.quantity}
        <input
          type="number"
          inputMode="numeric"
          step="1"
          class={FIELD}
          value={text}
          aria-describedby="stock-quantity-hint"
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <span id="stock-quantity-hint" class="text-text/70 text-xs">
          {mode === 'delta' ? labels.hintDelta : labels.hintSet}
        </span>
      </label>
      {invalid && <p class={ERROR_TEXT}>{labels.invalidQuantity}</p>}
      <label class={LABEL}>
        {labels.reason}
        <select
          class={FIELD}
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value as AdjustReason)}
        >
          {ADJUST_REASONS.map((option) => (
            <option value={option}>{adjustReasonLabel(labels, option)}</option>
          ))}
        </select>
      </label>
      <label class={LABEL}>
        {labels.note}
        <input
          type="text"
          maxLength={200}
          class={FIELD}
          value={note}
          onInput={(event) => setNote(event.currentTarget.value)}
        />
      </label>
      {props.error && (
        <p class={ERROR_TEXT} role="alert">
          {props.error}
        </p>
      )}
      <button type="submit" class={BUTTON_PRIMARY} disabled={props.busy}>
        {props.busy ? labels.saving : labels.submit}
      </button>
    </form>
  );
}
