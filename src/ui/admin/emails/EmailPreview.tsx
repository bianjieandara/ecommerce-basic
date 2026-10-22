// Rendered email in a sandboxed frame. The sandbox is empty, so no script or link in a copy can run in the admin.
import { HEADING, PANEL } from '@/ui/admin/lib/classes';
import type { EmailEditorLabels } from './email-editor-types';
import type { EmailPreviewState } from './use-email-preview';

/** Props of the preview panel. */
export interface EmailPreviewProps {
  state: EmailPreviewState;
  labels: Pick<EmailEditorLabels, 'preview' | 'previewTitle' | 'previewLoading' | 'previewFailed'>;
}

/**
 * Shows the last good rendering of the draft, with its state in words.
 * @param props Preview state and the translated labels.
 */
export function EmailPreview({ state, labels }: EmailPreviewProps) {
  const status =
    state.status === 'loading'
      ? labels.previewLoading
      : state.status === 'failed'
        ? labels.previewFailed
        : '';
  return (
    <section class={PANEL}>
      <h2 class={HEADING}>{labels.preview}</h2>
      <p role="status" class="text-text/70 min-h-5 text-sm">
        {status}
      </p>
      <iframe
        title={labels.previewTitle}
        srcDoc={state.html}
        sandbox=""
        class="rounded-brand border-text/20 min-h-96 w-full border bg-white"
      />
    </section>
  );
}
