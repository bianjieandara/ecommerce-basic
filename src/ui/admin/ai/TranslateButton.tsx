// Translate button for localized editors. It asks the server for a translation and hands the text to the editor; it never saves.
import { useState } from 'preact/hooks';
import { MAX_TRANSLATE_CHARS } from '@/application/ai/translate-schemas';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { BUTTON, ERROR_TEXT } from '@/ui/admin/lib/classes';

/** Texts of the translate button, all translated by the page. */
export interface TranslateButtonLabels {
  translate: string;
  translating: string;
  hint: string;
  empty: string;
  tooLong: string;
  placeholders: string;
  failed: string;
}

/** Props of the translate button. */
export interface TranslateButtonProps {
  /** Language of the text the editor wrote. */
  from: Locale;
  /** Language of the other tab, which receives the translation. */
  to: Locale;
  /** Reads the current text of the source field. */
  getText: () => string;
  /** Receives a translation that kept every placeholder. The editor decides whether to keep it. */
  onResult: (text: string) => void;
  labels: TranslateButtonLabels;
}

/** Response of the translate endpoint. */
interface TranslateResponse {
  text: string;
  placeholdersKept: boolean;
}

/** Where the button is in its cycle, which decides the message under it. */
type Status = 'idle' | 'busy' | 'empty' | 'tooLong' | 'placeholders' | 'failed';

/**
 * Translation button with its hint and the message of a refused call.
 * @param props Languages, the source text reader, the result handler and the texts.
 */
export default function TranslateButton(props: TranslateButtonProps) {
  const { from, to, getText, onResult, labels } = props;
  const [status, setStatus] = useState<Status>('idle');

  /** Sends the source text and reports the result. A translation that lost a placeholder is not applied. */
  async function translate() {
    const text = getText().trim();
    if (text === '') return setStatus('empty');
    if (text.length > MAX_TRANSLATE_CHARS) return setStatus('tooLong');
    setStatus('busy');
    const result = await postJson<TranslateResponse>('/api/admin/ai/translate', { text, from, to });
    if (!result.ok) return setStatus(result.code === 'VALIDATION_FAILED' ? 'tooLong' : 'failed');
    if (!result.data.placeholdersKept) return setStatus('placeholders');
    onResult(result.data.text);
    setStatus('idle');
  }

  const message = {
    idle: labels.hint,
    busy: labels.translating,
    empty: labels.empty,
    tooLong: labels.tooLong,
    placeholders: labels.placeholders,
    failed: labels.failed,
  }[status];
  const isError = status !== 'idle' && status !== 'busy';

  return (
    <div class="flex flex-col gap-1">
      <button type="button" class={BUTTON} disabled={status === 'busy'} onClick={() => void translate()}>
        {status === 'busy' ? labels.translating : labels.translate}
      </button>
      <p role={isError ? 'alert' : 'status'} class={isError ? ERROR_TEXT : 'text-text/70 text-sm'}>
        {message}
      </p>
    </div>
  );
}
