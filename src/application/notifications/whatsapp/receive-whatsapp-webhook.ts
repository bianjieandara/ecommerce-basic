// Meta's WhatsApp webhook: the subscription check (GET) and the signed deliveries (POST). Only the delivery statuses of messages
// we sent are applied, and they only move a log row forward. Incoming customer messages are acknowledged and not stored yet
// (the inbox is backlog). Failed checks throw DomainError, so the endpoint answers with the matching status.
import { z } from 'zod';
import { DomainError } from '@/domain/shared/errors';
import type { Clock } from '../../ports/platform';
import type {
  WhatsAppStatusRepository,
  WhatsAppStatusUpdate,
  WhatsAppWebhookAuth,
} from '../../ports/whatsapp';

/** One status entry of a delivery. Only the fields we read are declared. */
const statusEntry = z.object({
  id: z.string().min(1).max(200),
  status: z.string(),
  errors: z.array(z.object({ title: z.string().optional(), message: z.string().optional() })).optional(),
});

/** Dependencies of the webhook use case. */
export interface ReceiveWhatsAppWebhookDeps {
  auth: WhatsAppWebhookAuth;
  statuses: WhatsAppStatusRepository;
  clock: Clock;
}

/** Answers Meta's subscription check and applies signed delivery statuses. */
export class ReceiveWhatsAppWebhook {
  /** @param deps Signature and token checks, the status repository and the clock. */
  constructor(private readonly deps: ReceiveWhatsAppWebhookDeps) {}

  /**
   * Checks the verification request Meta sends when the webhook is set up.
   * @param params The hub.mode, hub.verify_token and hub.challenge query values.
   * @returns The challenge, which Meta expects back as plain text.
   * @throws DomainError FORBIDDEN when the mode or the token is wrong.
   */
  verifySubscription(params: {
    mode: string | null;
    token: string | null;
    challenge: string | null;
  }): string {
    if (params.mode !== 'subscribe' || !params.challenge) {
      throw new DomainError('FORBIDDEN', 'Webhook verification failed');
    }
    if (!this.deps.auth.verifySubscriptionToken(params.token)) {
      throw new DomainError('FORBIDDEN', 'Webhook verification failed');
    }
    return params.challenge;
  }

  /**
   * Applies one signed delivery. The signature covers the raw body, so the body is checked before it is parsed.
   * @param rawBody Body exactly as received.
   * @param signature Value of the X-Hub-Signature-256 header.
   * @returns How many log rows changed.
   * @throws DomainError FORBIDDEN for a bad signature, VALIDATION_FAILED for a body that is not JSON.
   */
  async receive(rawBody: string, signature: string | null): Promise<{ applied: number }> {
    if (!(await this.deps.auth.verifySignature(rawBody, signature))) {
      throw new DomainError('FORBIDDEN', 'Invalid webhook signature');
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new DomainError('VALIDATION_FAILED', 'Webhook body must be JSON');
    }
    const updates = statusUpdatesOf(body);
    if (updates.length === 0) return { applied: 0 };
    const applied = await this.deps.statuses.applyStatuses(updates, this.deps.clock.now().toISOString());
    return { applied };
  }
}

/**
 * Pulls the statuses this store acts on out of a delivery. Other statuses (sent, deleted, ...) and malformed entries are
 * skipped, so one odd entry never blocks the rest of the delivery.
 * @param body Parsed webhook body.
 * @returns Delivered, read and failed updates.
 */
export function statusUpdatesOf(body: unknown): WhatsAppStatusUpdate[] {
  const updates: WhatsAppStatusUpdate[] = [];
  for (const entry of listOf(recordOf(body)?.entry)) {
    for (const change of listOf(recordOf(entry)?.changes)) {
      for (const raw of listOf(recordOf(recordOf(change)?.value)?.statuses)) {
        const parsed = statusEntry.safeParse(raw);
        if (!parsed.success) continue;
        const { id, status, errors } = parsed.data;
        if (status !== 'delivered' && status !== 'read' && status !== 'failed') continue;
        const first = errors?.[0];
        updates.push({
          providerMessageId: id,
          status,
          error: first ? (first.title ?? first.message ?? null) : null,
        });
      }
    }
  }
  return updates;
}

/**
 * A value as a plain object, or null.
 * @param value Any parsed JSON value.
 * @returns The object, or null when the value is not one.
 */
function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * A value as an array, or an empty one.
 * @param value Any parsed JSON value.
 * @returns The array, or [].
 */
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
