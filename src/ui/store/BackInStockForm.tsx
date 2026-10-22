// Back-in-stock request for the chosen option of a product. The shopper leaves an email (and optionally a WhatsApp number);
// the answer comes from the stock-subscriptions endpoint, which runs the bot check and keeps the request.
import { useState } from 'preact/hooks';
import { useTurnstile } from '@/ui/lib/turnstile';

/** Translated text of the form. */
export interface BackInStockLabels {
  title: string;
  intro: string;
  email: string;
  phone: string;
  whatsapp: string;
  submit: string;
  sending: string;
  done: string;
  error: string;
  invalid: string;
  botFailed: string;
  rateLimited: string;
  unavailable: string;
}

/** Props of the back-in-stock form. */
export interface BackInStockFormProps {
  variantId: string;
  locale: 'es' | 'en';
  siteKey: string;
  labels: BackInStockLabels;
}

/** Form state: editing, sending, finished, or failed with a message. */
type Status = 'idle' | 'sending' | 'done' | 'error';

/** Input styling, the same as the other storefront fields. */
const FIELD = 'h-11 w-full rounded-brand border border-text/20 bg-white px-3 text-sm';

/**
 * Turns an error code of the endpoint into the text shown to the shopper.
 * @param labels Translated texts.
 * @param code Error code from the response, when there is one.
 * @returns The message for the shopper.
 */
function messageFor(labels: BackInStockLabels, code: string | undefined): string {
  switch (code) {
    case 'VALIDATION_FAILED':
      return labels.invalid;
    case 'BOT_CHECK_FAILED':
      return labels.botFailed;
    case 'RATE_LIMITED':
      return labels.rateLimited;
    case 'INVALID_STATE':
      return labels.unavailable;
    default:
      return labels.error;
  }
}

/**
 * Asks to hear when an out-of-stock option is available again.
 * @param props Variant, locale, Turnstile site key and translated labels.
 */
export default function BackInStockForm(props: BackInStockFormProps) {
  const { labels } = props;
  const [status, setStatus] = useState<Status>('idle');
  const [errorText, setErrorText] = useState('');
  const turnstile = useTurnstile(props.siteKey);

  /**
   * Sends the request. After a failure the fields stay filled, so the shopper can correct them.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget as HTMLFormElement);
    const phone = String(data.get('phone') ?? '').trim();
    setStatus('sending');
    try {
      const response = await fetch('/api/stock-subscriptions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variantId: props.variantId,
          email: String(data.get('email') ?? ''),
          phone: phone || null,
          locale: props.locale,
          whatsappOptIn: data.get('whatsappOptIn') === 'on',
          turnstileToken: turnstile.token(),
        }),
      });
      const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
      if (result.ok) {
        setStatus('done');
        return;
      }
      setErrorText(messageFor(labels, result.error?.code));
    } catch {
      setErrorText(labels.error);
    }
    turnstile.reset();
    setStatus('error');
  }

  if (status === 'done') {
    return (
      <p role="status" class="rounded-brand bg-surface p-4 text-sm">
        {labels.done}
      </p>
    );
  }

  return (
    <form onSubmit={submit} class="rounded-brand border-text/15 flex flex-col gap-3 border p-4">
      <h2 class="font-semibold">{labels.title}</h2>
      <p class="text-text/70 text-sm">{labels.intro}</p>
      <label class="flex flex-col gap-1 text-sm">
        <span>{labels.email}</span>
        <input type="email" name="email" required autoComplete="email" class={FIELD} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        <span>{labels.phone}</span>
        <input type="tel" name="phone" autoComplete="tel" class={FIELD} />
      </label>
      <label class="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="whatsappOptIn" class="accent-primary h-5 w-5" />
        <span>{labels.whatsapp}</span>
      </label>
      <div ref={turnstile.element} />
      {status === 'error' && (
        <p role="alert" class="text-accent text-sm">
          {errorText}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        class="rounded-brand bg-primary text-on-primary min-h-11 px-5 font-semibold disabled:opacity-60"
      >
        {status === 'sending' ? labels.sending : labels.submit}
      </button>
    </form>
  );
}
