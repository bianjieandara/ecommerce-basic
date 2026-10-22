// One WhatsApp message on the admin screen: its switch, Meta name, bilingual body, parameter mapping and button, and the four
// actions (save, submit to Meta, sync status, test to the admin's phone). Approved content is locked; a new Meta name unlocks it.
import { useState } from 'preact/hooks';
import type { SubmitResult } from '@/application/notifications/whatsapp/meta-sync';
import type { WhatsAppLink, WhatsAppVariable } from '@/application/notifications/whatsapp/definition';
import { WHATSAPP_LINKS, WHATSAPP_VARIABLES } from '@/application/notifications/whatsapp/definition';
import {
  isApproved,
  type SubmitLanguageResult,
  type WhatsAppTemplateEntry,
} from '@/application/notifications/whatsapp/view-model';
import type { WhatsAppRemoteStatus, WhatsAppTemplateConfig } from '@/application/ports/whatsapp';
import {
  BUTTON,
  BUTTON_PRIMARY,
  BADGE,
  BADGE_TONE,
  ERROR_TEXT,
  FIELD,
  HEADING,
  LABEL,
  PANEL,
} from '@/ui/admin/lib/classes';
import { postJson } from '@/ui/admin/lib/api-client';
import WhatsAppParamEditor from './WhatsAppParamEditor';
import { failureText, STATUS_TONE } from './whatsapp-card-text';
import WhatsAppSubmitResults from './WhatsAppSubmitResults';
import { draftOf, type WhatsAppDraft } from './whatsapp-draft';
import type { WhatsAppLabels } from './whatsapp-labels';

/** Props of one card. */
export interface WhatsAppTemplateCardProps {
  entry: WhatsAppTemplateEntry;
  labels: WhatsAppLabels;
}

/** The actions a card can run; one at a time. */
type Action = 'save' | 'submit' | 'sync' | 'test';

/** A line under the actions: success or failure. */
interface Notice {
  tone: 'ok' | 'error';
  text: string;
}

/**
 * The card of one WhatsApp message.
 * @param props Stored entry and labels.
 */
export default function WhatsAppTemplateCard({ entry, labels }: WhatsAppTemplateCardProps) {
  const [draft, setDraft] = useState<WhatsAppDraft>(() => draftOf(entry.config));
  const [remote, setRemote] = useState<WhatsAppRemoteStatus>(entry.config.remoteStatus);
  const [busy, setBusy] = useState<Action | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [results, setResults] = useState<SubmitLanguageResult[] | null>(null);
  const locked = isApproved({ remoteStatus: remote });
  const base = `/api/admin/whatsapp/${entry.key}`;
  const copy = labels.keys[entry.key];

  /**
   * Runs one action: marks it busy, posts, and hands the data to `onOk` or shows the failure.
   * @param action Which action runs.
   * @param url Endpoint.
   * @param body Request body.
   * @param onOk Handler of the answer data.
   */
  async function run<T>(action: Action, url: string, body: unknown, onOk: (data: T) => void): Promise<void> {
    setBusy(action);
    setNotice(null);
    const result = await postJson<T>(url, body);
    setBusy(null);
    if (result.ok) onOk(result.data);
    else setNotice({ tone: 'error', text: failureText(result, labels) });
  }

  /**
   * Stores the config as the server returned it, so the form shows what was saved.
   * @param config Saved config.
   */
  function onSaved(config: WhatsAppTemplateConfig) {
    setDraft(draftOf(config));
    setRemote(config.remoteStatus);
    setNotice({ tone: 'ok', text: labels.card.saved });
  }

  /** Sets one language's body in the draft. */
  function setBody(locale: 'es' | 'en', text: string) {
    setDraft({ ...draft, body: { ...draft.body, [locale]: text } });
  }

  return (
    <article class={PANEL} id={`whatsapp-${entry.key}`}>
      <header class="flex flex-col gap-2">
        <h2 class={HEADING}>{copy?.label}</h2>
        <p class="text-text/70 text-sm">{copy?.description}</p>
        <div class="flex flex-wrap items-center gap-2 text-xs">
          <span class={`${BADGE} ${BADGE_TONE.muted}`}>
            {entry.audience === 'customer' ? labels.card.audienceCustomer : labels.card.audienceStore}
          </span>
          {(['es', 'en'] as const).map((locale) => {
            const language = remote[locale];
            const status = language?.status ?? 'NOT_SUBMITTED';
            return (
              <span key={locale} class={`${BADGE} ${BADGE_TONE[STATUS_TONE[status]]}`}>
                {labels.card.languages[locale]}: {labels.statuses[status]}
              </span>
            );
          })}
        </div>
        {(['es', 'en'] as const).map((locale) => {
          const reason = remote[locale]?.reason;
          return reason ? (
            <p key={locale} class="text-text/70 text-xs break-words">
              {labels.card.languages[locale]} · {labels.card.reason}: {reason}
            </p>
          ) : null;
        })}
      </header>

      <label class="flex min-h-11 items-center gap-3 text-sm font-semibold">
        <input
          type="checkbox"
          class="size-5"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.currentTarget.checked })}
        />
        {labels.card.enabled}
      </label>

      {locked && <p class="bg-accent/15 rounded-brand p-3 text-sm">{labels.card.locked}</p>}

      <label class={LABEL}>
        {labels.card.metaName}
        <input
          class={FIELD}
          value={draft.metaName}
          onInput={(event) => setDraft({ ...draft, metaName: event.currentTarget.value })}
        />
        <span class="text-text/70 text-xs">{labels.card.metaNameHint}</span>
      </label>

      {(['es', 'en'] as const).map((locale) => (
        <label key={locale} class={LABEL}>
          {labels.card.body} · {labels.card.languages[locale]}
          <textarea
            class={`${FIELD} min-h-28 py-2`}
            rows={3}
            value={draft.body[locale]}
            disabled={locked}
            onInput={(event) => setBody(locale, event.currentTarget.value)}
          />
        </label>
      ))}
      <p class="text-text/70 text-xs">{labels.card.bodyHint}</p>

      <WhatsAppParamEditor
        params={draft.params as WhatsAppVariable[]}
        locked={locked}
        labels={labels}
        options={[...WHATSAPP_VARIABLES]}
        onChange={(params) => setDraft({ ...draft, params })}
      />

      {entry.buttonLabel ? (
        <label class={LABEL}>
          {labels.card.button}
          <select
            class={FIELD}
            value={draft.buttonPath ?? ''}
            disabled={locked}
            onChange={(event) =>
              setDraft({ ...draft, buttonPath: (event.currentTarget.value || null) as WhatsAppLink | null })
            }
          >
            <option value="">{labels.card.buttonNone}</option>
            {WHATSAPP_LINKS.map((link) => (
              <option key={link} value={link}>
                {labels.links[link]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p class="text-text/70 text-sm">{labels.card.noButton}</p>
      )}

      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class={BUTTON_PRIMARY}
          disabled={busy !== null}
          onClick={() => run<WhatsAppTemplateConfig>('save', base, draft, onSaved)}
        >
          {busy === 'save' ? labels.card.saving : labels.card.save}
        </button>
        <button
          type="button"
          class={BUTTON}
          disabled={busy !== null}
          onClick={() =>
            run<SubmitResult>('submit', `${base}/submit`, {}, (data) => {
              setRemote(data.remoteStatus);
              setResults(data.results);
            })
          }
        >
          {busy === 'submit' ? labels.card.submitting : labels.card.submit}
        </button>
        <button
          type="button"
          class={BUTTON}
          disabled={busy !== null}
          onClick={() =>
            run<WhatsAppRemoteStatus>('sync', `${base}/sync`, {}, (data) => {
              setRemote(data);
              setNotice({ tone: 'ok', text: labels.card.synced });
            })
          }
        >
          {busy === 'sync' ? labels.card.syncing : labels.card.sync}
        </button>
        <button
          type="button"
          class={BUTTON}
          disabled={busy !== null}
          onClick={() =>
            run<{ logId: string }>('test', `${base}/test`, {}, () =>
              setNotice({ tone: 'ok', text: labels.card.testQueued }),
            )
          }
        >
          {busy === 'test' ? labels.card.testing : labels.card.test}
        </button>
      </div>

      {notice && (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          class={notice.tone === 'error' ? ERROR_TEXT : 'text-sm'}
        >
          {notice.text}
        </p>
      )}

      {results && <WhatsAppSubmitResults results={results} labels={labels} />}
    </article>
  );
}
