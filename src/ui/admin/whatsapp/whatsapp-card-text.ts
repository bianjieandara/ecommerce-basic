// Text and colour helpers of the WhatsApp card: the status badge tone, and the sentence shown for a failed request.
import type { WhatsAppTemplateStatus } from '@/application/ports/whatsapp';
import type { ApiResult } from '@/ui/admin/lib/api-client';
import type { BADGE_TONE } from '@/ui/admin/lib/classes';
import type { WhatsAppLabels } from './whatsapp-labels';

/** Badge colour per status: approved is good, a refusal or a pause needs attention, the rest is waiting. */
export const STATUS_TONE: Record<WhatsAppTemplateStatus, keyof typeof BADGE_TONE> = {
  APPROVED: 'ok',
  PENDING: 'muted',
  NOT_SUBMITTED: 'muted',
  REJECTED: 'warn',
  PAUSED: 'warn',
  DISABLED: 'warn',
};

/** Details the API sends with a failure: a reason code, field issues, or Meta's own message. */
interface FailureDetails {
  reason?: string;
  provider?: string;
  issues?: { path: string; reason: keyof WhatsAppLabels['issues'] }[];
}

/**
 * The text shown for a failed request.
 * @param result Failed result of the API call.
 * @param labels Screen labels.
 * @returns A translated sentence; Meta's own message is added when Meta refused.
 */
export function failureText(
  result: Extract<ApiResult<unknown>, { ok: false }>,
  labels: WhatsAppLabels,
): string {
  const details = (result.details ?? {}) as FailureDetails;
  if (details.issues && details.issues.length > 0) {
    return details.issues
      .map((issue) => `${issue.path}: ${labels.issues[issue.reason] ?? issue.reason}`)
      .join(' ');
  }
  if (details.reason && labels.errors[details.reason])
    return labels.errors[details.reason] ?? labels.errors.generic ?? '';
  if (details.provider === 'meta') return `${labels.errors.PROVIDER} ${result.message}`;
  return labels.errors.generic ?? '';
}
