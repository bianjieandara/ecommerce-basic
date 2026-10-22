// Status form of one order: the states it may move to, the customer notice, the tracking code and a note. It posts the change and
// reloads the page, so the badge, the timeline and the allowed states always come from the server again.
import { useState } from 'preact/hooks';
import type { ManualOrderTarget, OrderStatus } from '@/domain/ordering/order-status';
import type { Dictionary } from '@/ui/i18n';
import { postJson } from '../lib/api-client';
import { BADGE_TONE, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL } from '../lib/classes';

/** The admin.orders sub-tree: every label of the order screens. */
export type OrderLabels = Dictionary['admin']['orders'];

/** Props of the status form. */
export interface OrderStatusFormProps {
  /** Order number; the status endpoint is addressed by it. */
  orderNumber: number;
  /** States the order may move to now. The page computes them, so the form never offers a move the server would refuse. */
  targets: ManualOrderTarget[];
  /** Labels of the order screens. */
  labels: OrderLabels;
  /** Error texts by code; the code's text is shown, the generic one when the code has none. */
  errors: Record<string, string>;
}

/**
 * Badge tone of each order state. The list and the detail both read it, so one state is coloured the same on both screens:
 * money received is positive, a closed order (cancelled or refunded) is accented, and the rest stays neutral.
 */
export const ORDER_STATUS_TONE: Record<OrderStatus, keyof typeof BADGE_TONE> = {
  pending_payment: 'muted',
  paid: 'ok',
  processing: 'ok',
  shipped: 'ok',
  delivered: 'ok',
  cancelled: 'warn',
  refunded: 'warn',
};

/**
 * Form that moves one order to a new state. A success reloads the page; a failure keeps what was typed and shows the message.
 * @param props Order number, the states it may move to, labels and error texts.
 */
export default function OrderStatusForm(props: OrderStatusFormProps) {
  const { labels, errors } = props;
  const [to, setTo] = useState<ManualOrderTarget | null>(props.targets[0] ?? null);
  const [notify, setNotify] = useState(true);
  const [tracking, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  /**
   * Sends the change. Busy stays on after a success, so the button cannot be pressed again while the page reloads.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    if (!to || busy) return;
    setBusy(true);
    setMessage('');
    const result = await postJson(`/api/admin/orders/${props.orderNumber}/status`, {
      to,
      notify,
      // A tracking code belongs to a shipment only; any other state sends an empty one.
      trackingCode: to === 'shipped' ? tracking.trim() : '',
      note: note.trim(),
    });
    if (result.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  if (!to) return null;
  return (
    <form class="flex flex-col gap-4" onSubmit={submit}>
      <label class={LABEL}>
        {labels.newStatus}
        <select
          class={FIELD}
          value={to}
          onChange={(event) => setTo(event.currentTarget.value as ManualOrderTarget)}
        >
          {props.targets.map((target) => (
            <option value={target}>{labels.states[target]}</option>
          ))}
        </select>
      </label>
      <label class="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          class="size-5"
          checked={notify}
          onChange={(event) => setNotify(event.currentTarget.checked)}
        />
        {labels.notify}
      </label>
      {to === 'shipped' && (
        <label class={LABEL}>
          {labels.tracking}
          <input
            type="text"
            maxLength={64}
            autoComplete="off"
            class={FIELD}
            value={tracking}
            onInput={(event) => setTracking(event.currentTarget.value)}
          />
        </label>
      )}
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
      {message && (
        <p class={ERROR_TEXT} role="alert">
          {message}
        </p>
      )}
      <button type="submit" class={BUTTON_PRIMARY} disabled={busy}>
        {busy ? labels.changing : labels.change}
      </button>
    </form>
  );
}
