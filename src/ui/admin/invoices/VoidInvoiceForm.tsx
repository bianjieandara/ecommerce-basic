// Owner form that voids an issued invoice. The reason is required; it stays on the invoice and on the order timeline. The page
// reloads after a successful void, so the status and the document show the mark.
import { useState } from 'preact/hooks';

/** Props of the void form. Every text comes from the page, which has the dictionary. */
export interface VoidInvoiceFormProps {
  invoiceId: string;
  labels: {
    title: string;
    hint: string;
    reason: string;
    button: string;
    busy: string;
    error: string;
  };
}

/** Shortest reason the server accepts. */
const MIN_REASON = 3;

/**
 * Form that voids one invoice.
 * @param props Invoice id and translated labels.
 */
export default function VoidInvoiceForm(props: VoidInvoiceFormProps) {
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');

  /**
   * Sends the void and reloads the page on success.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    setState('busy');
    try {
      const response = await fetch('/api/admin/invoices/void', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceId: props.invoiceId, reason: reason.trim() }),
      });
      const result = (await response.json()) as { ok: boolean };
      if (!result.ok) {
        setState('error');
        return;
      }
      window.location.reload();
    } catch {
      setState('error');
    }
  }

  const tooShort = reason.trim().length < MIN_REASON;
  return (
    <form onSubmit={submit} class="rounded-brand border-text/15 flex flex-col gap-3 border p-4">
      <h2 class="font-semibold">{props.labels.title}</h2>
      <p class="text-text/70 text-sm">{props.labels.hint}</p>
      <label class="flex flex-col gap-1 text-sm">
        {props.labels.reason}
        <input
          name="reason"
          required
          minLength={MIN_REASON}
          maxLength={200}
          value={reason}
          onInput={(event) => setReason((event.currentTarget as HTMLInputElement).value)}
          class="rounded-brand border-text/20 min-h-11 w-full border bg-white px-3"
        />
      </label>
      {state === 'error' && (
        <p role="alert" class="text-accent text-sm">
          {props.labels.error}
        </p>
      )}
      <button
        type="submit"
        disabled={state === 'busy' || tooShort}
        class="rounded-brand bg-primary text-on-primary min-h-11 px-4 font-semibold disabled:opacity-60"
      >
        {state === 'busy' ? props.labels.busy : props.labels.button}
      </button>
    </form>
  );
}
