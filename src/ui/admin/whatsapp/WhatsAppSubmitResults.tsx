// Outcome of the last submit to Meta, one line per language. Failures show the code's text and Meta's own message.
import type { SubmitLanguageResult } from '@/application/notifications/whatsapp/view-model';
import type { WhatsAppLabels } from './whatsapp-labels';

/** Props of the outcome list. */
export interface WhatsAppSubmitResultsProps {
  results: SubmitLanguageResult[];
  labels: WhatsAppLabels;
}

/**
 * The per-language outcome of a submit.
 * @param props Results and labels.
 */
export default function WhatsAppSubmitResults({ results, labels }: WhatsAppSubmitResultsProps) {
  return (
    <ul class="flex flex-col gap-1 text-sm">
      <li class="font-semibold">{labels.card.submitResults}</li>
      {results.map((item) => (
        <li key={item.locale}>
          {labels.card.languages[item.locale]}:{' '}
          {item.outcome === 'submitted'
            ? labels.card.submitted
            : item.outcome === 'already_exists'
              ? labels.card.alreadyExists
              : `${labels.card.submitFailed} ${item.detail ?? labels.errors[item.reason ?? ''] ?? ''}`}
        </li>
      ))}
    </ul>
  );
}
