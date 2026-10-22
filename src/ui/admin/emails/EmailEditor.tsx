// Editor of one notification email: its copy in each language, the placeholders it may use, whether it is sent, and a live
// preview. Save, restore and the test send each post to their endpoint and show the answer in words.
import { useRef, useState } from 'preact/hooks';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import {
  BADGE,
  BADGE_TONE,
  BUTTON,
  BUTTON_PRIMARY,
  ERROR_TEXT,
  FIELD,
  LABEL,
  PANEL,
} from '@/ui/admin/lib/classes';
import { issueMessages } from '@/ui/admin/lib/issue-messages';
import { EmailInsertPanel } from './EmailInsertPanel';
import { EmailPreview } from './EmailPreview';
import type { EmailEditorProps } from './email-editor-types';
import { insertAt } from './email-tokens';
import { useEmailPreview } from './use-email-preview';

const BODY_FIELD = 'rounded-brand border-text/20 min-h-48 w-full border bg-white px-3 py-2 font-mono text-sm';
const LANGUAGES: Locale[] = ['es', 'en'];

/** Subject and body of one language. */
type Drafts = EmailEditorProps['copies'];

/** One line under the actions: what the last action answered. */
interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/**
 * The email editor island.
 * @param props The email, its copy and the translated labels, from the page.
 */
export default function EmailEditor(props: EmailEditorProps) {
  const { labels } = props;
  const [lang, setLang] = useState<Locale>(props.locale);
  const [drafts, setDrafts] = useState<Drafts>(props.copies);
  const [enabled, setEnabled] = useState(props.enabled);
  const [customized, setCustomized] = useState(props.customized);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<'save' | 'restore' | 'test' | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const url = `/api/admin/emails/${props.emailKey}`;
  const draft = drafts[lang];
  const preview = useEmailPreview(
    `${url}/preview`,
    { locale: lang, subject: draft.subject, body: draft.body },
    labels.invalid,
  );
  // Field errors: the last save's refusals, and the live preview's refusals for the draft on screen.
  const errors = { ...saveErrors, ...preview.issues };
  const subjectError = errors[`subject.${lang}`];
  const bodyError = errors[`body.${lang}`];

  /**
   * Changes one field of the draft on screen. An earlier save's refusals no longer apply once the copy changes.
   * @param field Subject or body.
   * @param value New text.
   */
  function updateDraft(field: 'subject' | 'body', value: string): void {
    setDrafts((previous) => ({ ...previous, [lang]: { ...previous[lang], [field]: value } }));
    setSaveErrors({});
  }

  /**
   * Writes a placeholder into the body at the cursor.
   * @param token Placeholder text from the insert panel.
   */
  function insert(token: string): void {
    const field = bodyRef.current;
    const start = field?.selectionStart ?? draft.body.length;
    const end = field?.selectionEnd ?? start;
    const next = insertAt(draft.body, start, end, token);
    updateDraft('body', next.text);
    // The caret moves once the new text is rendered; the next frame is after that.
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(next.caret, next.caret);
    });
  }

  /** Saves both languages and the sent flag. */
  async function save(): Promise<void> {
    setBusy('save');
    setNotice(null);
    const result = await postJson(url, {
      subject: { es: drafts.es.subject, en: drafts.en.subject },
      body: { es: drafts.es.body, en: drafts.en.body },
      enabled,
    });
    setBusy(null);
    if (result.ok) {
      setCustomized(true);
      setSaveErrors({});
      setNotice({ tone: 'ok', text: labels.saved });
      return;
    }
    setSaveErrors(result.code === 'VALIDATION_FAILED' ? issueMessages(result.details, labels.invalid) : {});
    setNotice({ tone: 'error', text: result.code === 'FORBIDDEN' ? labels.forbidden : labels.failed });
  }

  /** Removes the saved copy after the admin confirms; the default copy and sent flag come back on screen. */
  async function restore(): Promise<void> {
    if (!window.confirm(labels.confirmRestore)) return;
    setBusy('restore');
    setNotice(null);
    const result = await postJson(`${url}/restore`, {});
    setBusy(null);
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.code === 'FORBIDDEN' ? labels.forbidden : labels.failed });
      return;
    }
    setDrafts(props.defaults);
    setEnabled(true);
    setCustomized(false);
    setSaveErrors({});
    setNotice({ tone: 'ok', text: labels.restored });
  }

  /** Queues a test of the saved copy to the admin's own address. */
  async function sendTest(): Promise<void> {
    setBusy('test');
    setNotice(null);
    const result = await postJson<{ logIds: string[] }>(`${url}/test`, {});
    setBusy(null);
    if (!result.ok || result.data.logIds.length === 0) {
      setNotice({ tone: 'error', text: labels.testFailed });
      return;
    }
    setNotice({ tone: 'ok', text: labels.testSent.replace('{email}', props.testAddress) });
  }

  const tab = (code: Locale) =>
    `min-h-11 rounded-brand border px-4 text-sm font-semibold ${
      lang === code ? 'border-primary bg-primary text-on-primary' : 'border-text/20 bg-white'
    }`;
  const disabled = busy !== null;

  return (
    <div class="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          <span class={`${BADGE} ${customized ? BADGE_TONE.ok : BADGE_TONE.muted}`}>
            {customized ? labels.customized : labels.standard}
          </span>
        </div>

        <div role="tablist" class="flex gap-2">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={lang === code}
              class={tab(code)}
              onClick={() => setLang(code)}
            >
              {labels.languages[code]}
            </button>
          ))}
        </div>

        <section class={PANEL}>
          <label class={LABEL}>
            <span class="font-semibold">{labels.subject}</span>
            <input
              class={FIELD}
              value={draft.subject}
              aria-invalid={subjectError ? 'true' : undefined}
              onInput={(event) => updateDraft('subject', event.currentTarget.value)}
            />
            {subjectError && (
              <span role="alert" class={ERROR_TEXT}>
                {subjectError}
              </span>
            )}
          </label>
          <label class={LABEL}>
            <span class="font-semibold">{labels.body}</span>
            <textarea
              ref={bodyRef}
              class={BODY_FIELD}
              rows={14}
              value={draft.body}
              aria-invalid={bodyError ? 'true' : undefined}
              onInput={(event) => updateDraft('body', event.currentTarget.value)}
            />
            {bodyError && (
              <span role="alert" class={ERROR_TEXT}>
                {bodyError}
              </span>
            )}
          </label>
        </section>

        <EmailInsertPanel
          labels={labels}
          variables={props.variables}
          blocks={props.blocks}
          onInsert={insert}
        />

        <section class={PANEL}>
          <label class="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              class="size-5"
              checked={enabled}
              disabled={!props.canDisable || disabled}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
            />
            <span class="font-semibold">{labels.enabled}</span>
          </label>
          {!props.canDisable && <p class="text-text/70 text-sm">{labels.enabledHelp}</p>}
          <div class="flex flex-wrap gap-2">
            <button type="button" class={BUTTON_PRIMARY} disabled={disabled} onClick={save}>
              {busy === 'save' ? labels.saving : labels.save}
            </button>
            <button type="button" class={BUTTON} disabled={disabled} onClick={restore}>
              {busy === 'restore' ? labels.restoring : labels.restore}
            </button>
            <button type="button" class={BUTTON} disabled={disabled} onClick={sendTest}>
              {busy === 'test' ? labels.testing : labels.test}
            </button>
          </div>
          <p class="text-text/70 text-sm">{labels.testHelp}</p>
          {notice && (
            <p
              role={notice.tone === 'error' ? 'alert' : 'status'}
              class={notice.tone === 'error' ? ERROR_TEXT : 'text-sm'}
            >
              {notice.text}
            </p>
          )}
        </section>
      </div>

      <EmailPreview state={preview} labels={labels} />
    </div>
  );
}
