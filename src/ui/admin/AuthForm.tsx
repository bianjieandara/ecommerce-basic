// Admin sign-in, first-owner setup and password forms (Preact island). Each mode posts JSON to its admin endpoint. Sign-in
// and setup move on to the dashboard; the password forms show a confirmation instead.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ADMIN_PATHS } from '@/domain/shared/paths';
import { postJson } from './lib/api-client';

/** Which form the island shows. */
export type AuthMode = 'setup' | 'login' | 'forgot' | 'reset';

/** Labels of the form. The page passes the ones its mode uses. */
export interface AuthFormLabels {
  setupToken?: string;
  name?: string;
  email?: string;
  password?: string;
  submit: string;
  submitting: string;
  /** Confirmation shown after a reset request or a new password. */
  done?: string;
  /** Link to sign-in, shown with the confirmation. */
  signIn?: string;
  /** Link to the reset request, shown under the sign-in form. */
  forgot?: string;
}

/** Props of the island. */
export interface AuthFormProps {
  mode: AuthMode;
  locale: 'es' | 'en';
  /** Turnstile site key, for the bot check on sign-in and reset requests. */
  siteKey: string;
  /** Where to go after sign-in or setup. The server only passes admin paths. */
  next?: string;
  /** Token from the reset or invitation link (reset mode). */
  token?: string;
  labels: AuthFormLabels;
  /** Translated messages by error code. `generic` is the fallback. */
  errors: Record<string, string>;
}

/** The part of the Turnstile API that the script on the page provides. */
interface TurnstileApi {
  render(container: HTMLElement, options: { sitekey: string }): string;
  reset(): void;
}

const ENDPOINTS: Record<AuthMode, string> = {
  setup: '/api/admin/setup',
  login: '/api/admin/login',
  forgot: '/api/admin/password/forgot',
  reset: '/api/admin/password/reset',
};

const inputClass = 'rounded-brand border-text/20 min-h-11 w-full border bg-white px-3';

/**
 * Turnstile API, once the script on the page has loaded.
 * @returns The API, or undefined before then.
 */
function turnstileApi(): TurnstileApi | undefined {
  return (window as Window & { turnstile?: TurnstileApi }).turnstile;
}

/**
 * Turnstile token, once the widget has produced one.
 * @returns The token, or null.
 */
function turnstileToken(): string | null {
  const input = document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  return input?.value ? input.value : null;
}

/**
 * Builds the JSON body of one mode from the form fields. Passwords are sent exactly as typed.
 * @param props Island props (mode, locale and token).
 * @param data Submitted form data.
 * @returns The request body.
 */
function bodyFor(props: AuthFormProps, data: FormData): Record<string, unknown> {
  const text = (name: string) => String(data.get(name) ?? '').trim();
  const password = String(data.get('password') ?? '');
  switch (props.mode) {
    case 'setup':
      return {
        setupToken: text('setupToken'),
        name: text('name'),
        email: text('email'),
        password,
        locale: props.locale,
      };
    case 'login':
      return { email: text('email'), password, turnstileToken: turnstileToken() };
    case 'forgot':
      return { email: text('email'), turnstileToken: turnstileToken() };
    case 'reset':
      return { token: props.token, password };
  }
}

/**
 * Admin auth form for one mode.
 * @param props Mode, labels and messages.
 */
export default function AuthForm(props: AuthFormProps) {
  const { mode, labels } = props;
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const botCheck = useRef<HTMLDivElement>(null);
  const withBotCheck = mode === 'login' || mode === 'forgot';

  // The Turnstile script loads asynchronously and only renders widgets that exist when it runs, so this island renders
  // its own widget once the API is there.
  useEffect(() => {
    if (!withBotCheck) return undefined;
    const timer = window.setInterval(() => {
      const api = turnstileApi();
      if (api && botCheck.current) {
        api.render(botCheck.current, { sitekey: props.siteKey });
        window.clearInterval(timer);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [withBotCheck, props.siteKey]);

  /**
   * Posts the form and reacts to the answer.
   * @param event Form submit event.
   */
  async function submit(event: Event) {
    event.preventDefault();
    setStatus('sending');
    setMessage('');
    const body = bodyFor(props, new FormData(event.currentTarget as HTMLFormElement));
    const result = await postJson(ENDPOINTS[mode], body);
    if (result.ok) {
      if (mode === 'login' || mode === 'setup') {
        window.location.assign(props.next ?? ADMIN_PATHS.dashboard);
        return;
      }
      setStatus('done');
      return;
    }
    // A Turnstile token works once, so ask for a fresh one before the next attempt.
    if (withBotCheck) turnstileApi()?.reset();
    setMessage(props.errors[result.code] ?? props.errors.generic ?? '');
    setStatus('error');
  }

  if (status === 'done') {
    return (
      <div role="status" class="rounded-brand bg-surface flex flex-col gap-3 p-4">
        <p class="text-sm">{labels.done}</p>
        <a href={ADMIN_PATHS.login} class="font-semibold underline">
          {labels.signIn}
        </a>
      </div>
    );
  }

  return (
    <form class="flex flex-col gap-4" onSubmit={submit}>
      {mode === 'setup' && (
        <label class="flex flex-col gap-1 text-sm">
          {labels.setupToken}
          <input name="setupToken" required minLength={8} autoComplete="off" class={inputClass} />
        </label>
      )}
      {mode === 'setup' && (
        <label class="flex flex-col gap-1 text-sm">
          {labels.name}
          <input name="name" autoComplete="name" required minLength={2} class={inputClass} />
        </label>
      )}
      {mode !== 'reset' && (
        <label class="flex flex-col gap-1 text-sm">
          {labels.email}
          <input name="email" type="email" autoComplete="email" required class={inputClass} />
        </label>
      )}
      {mode !== 'forgot' && (
        <label class="flex flex-col gap-1 text-sm">
          {labels.password}
          <input
            name="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'login' ? 1 : 12}
            class={inputClass}
          />
        </label>
      )}
      {withBotCheck && <div ref={botCheck} />}
      {status === 'error' && (
        <p role="alert" class="text-accent text-sm">
          {message}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center font-semibold disabled:opacity-50"
      >
        {status === 'sending' ? labels.submitting : labels.submit}
      </button>
      {mode === 'login' && (
        <a href={ADMIN_PATHS.forgotPassword} class="text-sm underline">
          {labels.forgot}
        </a>
      )}
    </form>
  );
}
