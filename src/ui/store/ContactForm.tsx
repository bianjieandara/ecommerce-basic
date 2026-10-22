// Contact form (Preact island). It posts the message to /api/contact and shows the answer. The honeypot field is hidden
// from people; a bot that fills it gets the same success answer as anyone else.
import { useState } from 'preact/hooks';
import { useTurnstile } from '@/ui/lib/turnstile';

/** Labels of the contact form. Translated on the server. */
export interface ContactFormLabels {
  name: string;
  email: string;
  phone: string;
  message: string;
  send: string;
  sending: string;
  sentTitle: string;
  sentText: string;
  error: string;
  invalid: string;
  rateLimited: string;
}

/** Props of the contact form. */
export interface ContactFormProps {
  locale: 'es' | 'en';
  siteKey: string;
  labels: ContactFormLabels;
}

/**
 * Contact form with its own answer messages.
 * @param props Locale, Turnstile site key and translated labels.
 */
export default function ContactForm(props: ContactFormProps) {
  const { labels } = props;
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const inputClass = 'rounded-brand border-text/20 min-h-11 w-full border bg-white px-3';
  const turnstile = useTurnstile(props.siteKey);

  /**
   * Sends the message and shows the answer.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '').trim();
    setStatus('sending');
    setErrorText('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          locale: props.locale,
          name: field('name'),
          email: field('email'),
          phone: field('phone'),
          message: field('message'),
          website: field('website'),
          turnstileToken: turnstile.token(),
        }),
      });
      const result = (await response.json()) as { ok: boolean; error?: { code?: string } };
      turnstile.reset();
      if (result.ok) {
        form.reset();
        setStatus('sent');
        return;
      }
      setErrorText(
        result.error?.code === 'RATE_LIMITED'
          ? labels.rateLimited
          : result.error?.code === 'VALIDATION_FAILED'
            ? labels.invalid
            : labels.error,
      );
      setStatus('error');
    } catch {
      setErrorText(labels.error);
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div class="rounded-brand bg-surface flex flex-col gap-2 p-4" role="status">
        <p class="font-semibold">{labels.sentTitle}</p>
        <p class="text-sm">{labels.sentText}</p>
      </div>
    );
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={submit}>
      <label class="flex flex-col gap-1 text-sm">
        {labels.name}
        <input name="name" autoComplete="name" required minLength={2} class={inputClass} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {labels.email}
        <input name="email" type="email" autoComplete="email" required class={inputClass} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {labels.phone}
        <input name="phone" type="tel" autoComplete="tel" class={inputClass} />
      </label>
      <label class="flex flex-col gap-1 text-sm">
        {labels.message}
        <textarea name="message" rows={5} required minLength={10} maxLength={2000} class={inputClass} />
      </label>
      <div class="hidden" aria-hidden="true">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div ref={turnstile.element} />
      {status === 'error' && (
        <p role="alert" class="text-accent text-sm">
          {errorText}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center font-semibold disabled:opacity-50"
      >
        {status === 'sending' ? labels.sending : labels.send}
      </button>
    </form>
  );
}
