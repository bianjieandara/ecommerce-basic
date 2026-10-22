// Live preview of the email editor. It asks the server to render the draft 400 ms after the last change and ignores answers
// that a newer change has overtaken. A draft the server refuses keeps the last good rendering and reports the fields.
import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '@/domain/shared/locale';
import { postJson } from '@/ui/admin/lib/api-client';
import { issueMessages } from '@/ui/admin/lib/issue-messages';

/** Wait after the last change before asking the server, so typing does not send a request per key. */
const DEBOUNCE_MS = 400;

/** What the preview renders: one language's subject and body. */
export interface PreviewDraft {
  locale: Locale;
  subject: string;
  body: string;
}

/** The preview as the editor shows it. `issues` is keyed by `subject.<locale>` or `body.<locale>`. */
export interface EmailPreviewState {
  html: string;
  status: 'loading' | 'ready' | 'invalid' | 'failed';
  issues: Record<string, string>;
}

/** Shape of a rendered email in the preview answer. */
interface RenderedHtml {
  subject: string;
  html: string;
  text: string;
}

/**
 * Keeps the preview in step with the draft.
 * @param url Preview endpoint of the email.
 * @param draft Language, subject and body to render.
 * @param invalidText Message shown for every refused field.
 * @returns The current rendering and its status.
 */
export function useEmailPreview(url: string, draft: PreviewDraft, invalidText: string): EmailPreviewState {
  const [state, setState] = useState<EmailPreviewState>({ html: '', status: 'loading', issues: {} });
  const { locale, subject, body } = draft;

  useEffect(() => {
    let current = true;
    setState((previous) => ({ ...previous, status: 'loading' }));
    const timer = window.setTimeout(() => {
      void postJson<RenderedHtml>(url, { locale, subject, body }).then((result) => {
        if (!current) return;
        if (result.ok) {
          setState({ html: result.data.html, status: 'ready', issues: {} });
        } else if (result.code === 'VALIDATION_FAILED') {
          setState((previous) => ({
            ...previous,
            status: 'invalid',
            issues: issueMessages(result.details, invalidText),
          }));
        } else {
          setState((previous) => ({ ...previous, status: 'failed' }));
        }
      });
    }, DEBOUNCE_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [url, locale, subject, body, invalidText]);

  return state;
}
