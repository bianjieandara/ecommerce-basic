// Refund panel of one order: the whole payment goes back to the customer through the provider. Two steps, so a stray click never
// moves money: the button asks, a second button confirms. A success reloads the page, so the badge and the timeline come from
// the server again.
import { useState } from 'preact/hooks';
import { postJson } from '../lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT } from '../lib/classes';
import type { OrderLabels } from './OrderStatusForm';

/** Props of the refund panel. */
export interface OrderRefundPanelProps {
  /** Order number; the refund endpoint is addressed by it. */
  orderNumber: number;
  /** The total, already formatted for the admin's language, for example "$12.00". */
  amount: string;
  /** The provider's name, for example "dLocal Go". */
  provider: string;
  /** Labels of the order screens. */
  labels: OrderLabels;
  /** Error texts by code. */
  errors: Record<string, string>;
}

/**
 * The refund button with its confirmation step.
 * @param props Order, amount, provider, labels and error texts.
 */
export default function OrderRefundPanel({
  orderNumber,
  amount,
  provider,
  labels,
  errors,
}: OrderRefundPanelProps) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const fill = (text: string) => text.replaceAll('{amount}', amount).replaceAll('{provider}', provider);

  /** Sends the refund. Busy stays on after a success, so it cannot be sent twice while the page reloads. */
  async function refund() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await postJson(`/api/admin/orders/${orderNumber}/refund`, {});
    if (result.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    setAsking(false);
    setMessage(errors[result.code] ?? errors.generic ?? '');
  }

  return (
    <div class="flex flex-col gap-3">
      <p class="text-sm">{fill(labels.refundIntro)}</p>
      {message && (
        <p class={ERROR_TEXT} role="alert">
          {message}
        </p>
      )}
      {asking ? (
        <div class="flex flex-wrap gap-2">
          <button type="button" class={BUTTON_PRIMARY} disabled={busy} onClick={refund}>
            {busy ? labels.refundRunning : fill(labels.refundConfirm)}
          </button>
          <button type="button" class={BUTTON} disabled={busy} onClick={() => setAsking(false)}>
            {labels.refundKeep}
          </button>
        </div>
      ) : (
        <button type="button" class={BUTTON} onClick={() => setAsking(true)}>
          {fill(labels.refundButton)}
        </button>
      )}
    </div>
  );
}
