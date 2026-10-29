// Proof of payment for an order paid by hand. The buyer picks the picture their bank or wallet gave them and it reaches the
// store with the order, instead of travelling by chat. Uploading does not pay the order: the store still confirms it.
import { useState } from 'preact/hooks';

/** Translated text of the form. */
export interface PaymentReceiptLabels {
  title: string;
  intro: string;
  file: string;
  submit: string;
  sending: string;
  done: string;
  uploaded: string;
  view: string;
  replace: string;
  error: string;
  tooLarge: string;
  wrongType: string;
  unavailable: string;
  rateLimited: string;
}

/** Props of the receipt form. */
export interface PaymentReceiptFormProps {
  orderNumber: number;
  /** Access key from the order link; the endpoint takes the same one. */
  accessKey: string;
  /** Content types the store accepts, for the file picker and the first check. */
  accept: string;
  /** Largest file the store accepts, in bytes. */
  maxBytes: number;
  /** True when a receipt was already uploaded, so the form opens as a confirmation with a link. */
  hasReceipt: boolean;
  labels: PaymentReceiptLabels;
}

/** Form state: choosing, sending, stored, or failed with a message. */
type Status = 'idle' | 'sending' | 'done' | 'error';

/**
 * Turns an error code of the endpoint into the text shown to the buyer.
 * @param labels Translated texts.
 * @param code Error code from the response, when there is one.
 * @returns The message for the buyer.
 */
function messageFor(labels: PaymentReceiptLabels, code: string | undefined): string {
  switch (code) {
    case 'VALIDATION_FAILED':
      return labels.wrongType;
    case 'INVALID_STATE':
      return labels.unavailable;
    case 'RATE_LIMITED':
      return labels.rateLimited;
    default:
      return labels.error;
  }
}

/**
 * Lets the buyer attach the proof of their payment to the order.
 * @param props Order number, access key, accepted types and translated labels.
 */
export default function PaymentReceiptForm(props: PaymentReceiptFormProps) {
  const { labels } = props;
  const [status, setStatus] = useState<Status>(props.hasReceipt ? 'done' : 'idle');
  const [errorText, setErrorText] = useState('');
  // Open the picker again after a receipt is already in: a buyer who sent the wrong picture can replace it.
  const [replacing, setReplacing] = useState(false);
  const href = `/api/orders/${props.orderNumber}/receipt?key=${encodeURIComponent(props.accessKey)}`;

  /**
   * Sends the chosen file. The size is checked here too, so an oversized picture fails before it is uploaded.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) return;
    if (file.size > props.maxBytes) {
      setErrorText(labels.tooLarge);
      setStatus('error');
      return;
    }
    data.set('key', props.accessKey);
    setStatus('sending');
    try {
      const response = await fetch(`/api/orders/${props.orderNumber}/receipt`, {
        method: 'POST',
        body: data,
      });
      const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
      if (result.ok) {
        setReplacing(false);
        setStatus('done');
        return;
      }
      setErrorText(messageFor(labels, result.error?.code));
    } catch {
      setErrorText(labels.error);
    }
    setStatus('error');
  }

  if (status === 'done' && !replacing) {
    return (
      <div class="rounded-brand border-text/15 flex flex-col gap-2 border p-4 text-sm">
        <p role="status" class="font-medium">
          {props.hasReceipt ? labels.uploaded : labels.done}
        </p>
        <div class="flex flex-wrap items-center gap-x-5">
          <a
            href={href}
            target="_blank"
            rel="noopener"
            class="-my-3 inline-flex min-h-11 items-center underline"
          >
            {labels.view}
          </a>
          <button
            type="button"
            onClick={() => setReplacing(true)}
            class="text-text/70 -my-3 inline-flex min-h-11 items-center underline"
          >
            {labels.replace}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} class="rounded-brand border-text/15 flex flex-col gap-3 border p-4">
      <h2 class="font-semibold">{labels.title}</h2>
      <p class="text-text/70 text-sm">{labels.intro}</p>
      <label class="flex flex-col gap-1 text-sm">
        <span>{labels.file}</span>
        <input
          type="file"
          name="file"
          id="payment-receipt-file"
          required
          accept={props.accept}
          class="border-text/20 rounded-brand w-full border p-2 text-sm file:border-0 file:bg-transparent file:py-2.5"
        />
      </label>
      {status === 'error' && (
        <p role="alert" class="text-accent text-sm">
          {errorText}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center px-6 font-semibold disabled:opacity-50"
      >
        {status === 'sending' ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
