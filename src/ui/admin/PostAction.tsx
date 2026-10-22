// One button that sends a POST to an admin endpoint and shows the outcome. For actions that need no input: sending a message or an
// invoice again, marking a message read, retrying or discarding a job. Every text comes from the page, which has the dictionary.
import { useState } from 'preact/hooks';

/** Props of the action button. */
export interface PostActionProps {
  /** Endpoint to POST to. */
  url: string;
  /** Button text. */
  label: string;
  /** Button text while the request runs. */
  busyLabel: string;
  /** Text shown after success. */
  doneLabel: string;
  /** Text shown after a failure. */
  errorLabel: string;
  /** Reload the page after success, so the list or the detail shows the new state. */
  reload?: boolean;
  /** False for a secondary action, drawn with an outline. */
  primary?: boolean;
}

/** Button that sends one POST when pressed. */
export default function PostAction(props: PostActionProps) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  /** Sends the request and records the answer. */
  async function press() {
    setState('busy');
    try {
      const response = await fetch(props.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const result = (await response.json()) as { ok: boolean };
      if (!result.ok) {
        setState('error');
        return;
      }
      setState('done');
      if (props.reload) window.location.reload();
    } catch {
      setState('error');
    }
  }

  const tone = props.primary === false ? 'border-text/20 border bg-white' : 'bg-primary text-on-primary';
  return (
    <span class="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={state === 'busy' || state === 'done'}
        onClick={press}
        class={`rounded-brand min-h-11 px-4 text-sm font-semibold disabled:opacity-60 ${tone}`}
      >
        {state === 'busy' ? props.busyLabel : props.label}
      </button>
      {state === 'done' && (
        <span role="status" class="text-sm">
          {props.doneLabel}
        </span>
      )}
      {state === 'error' && (
        <span role="alert" class="text-accent text-sm">
          {props.errorLabel}
        </span>
      )}
    </span>
  );
}
