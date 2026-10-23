// WhatsApp Cloud API sender: uploads a document for a template header and sends a template message through the phone number.
// Settings are read once, when the container is built; without them the sender reports not configured and refuses to send.
import { DomainError, RetryableError } from '@/domain/shared/errors';
import type { WhatsAppMedia, WhatsAppSender, WhatsAppTemplateMessage } from '@/application/ports/whatsapp';
import type { MetaGraphClient } from './graph-client';

/**
 * The recipient as the Cloud API addresses it. Argentine mobiles are stored with a "9" after the country code (549 + area
 * + number), but Meta's allowed-recipient list and sends use the form without it (54 + area + number). The domain keeps
 * the full E.164 number; only this adapter changes it.
 * @param phone Digits with country code, as normalized by the domain.
 * @returns The digits in the form the Cloud API accepts.
 */
export function metaRecipient(phone: string): string {
  return /^549\d{10}$/.test(phone) ? `54${phone.slice(3)}` : phone;
}

/** Body of a template message in the shape the Cloud API expects. Exported so the payload can be checked without a call. */
export function templatePayload(message: WhatsAppTemplateMessage): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (message.document) {
    components.push({
      type: 'header',
      parameters: [
        { type: 'document', document: { id: message.document.mediaId, filename: message.document.filename } },
      ],
    });
  }
  components.push({
    type: 'body',
    parameters: message.bodyParams.map((text) => ({ type: 'text', text })),
  });
  if (message.buttonSuffix !== null) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: message.buttonSuffix }],
    });
  }
  return {
    messaging_product: 'whatsapp',
    to: metaRecipient(message.to),
    type: 'template',
    template: {
      name: message.templateName,
      language: { code: message.languageCode },
      components,
    },
  };
}

/** Sends messages from one WhatsApp phone number. */
export class WhatsAppCloudSender implements WhatsAppSender {
  /**
   * @param graph Shared Graph client.
   * @param phoneNumberId WHATSAPP_PHONE_NUMBER_ID, or null when not set.
   */
  constructor(
    private readonly graph: MetaGraphClient,
    private readonly phoneNumberId: string | null,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.phoneNumberId) && this.graph.isConfigured();
  }

  /**
   * Uploads a file for a message header. The media id is valid for sending for a limited time, so the upload happens right
   * before the send.
   * @param file The PDF to upload.
   * @returns The media id to reference in the message.
   */
  async uploadMedia(file: WhatsAppMedia): Promise<{ mediaId: string }> {
    const form = new FormData();
    form.set('messaging_product', 'whatsapp');
    form.set('type', file.contentType);
    form.set('file', new Blob([file.content], { type: file.contentType }), file.filename);
    const result = await this.graph.request<{ id?: string }>(`${this.requireNumber()}/media`, {
      method: 'POST',
      body: form,
    });
    if (!result.id) throw new RetryableError('Meta accepted the upload without a media id');
    return { mediaId: result.id };
  }

  /**
   * Sends one template message.
   * @param message Recipient, template, parameters and optional button and document.
   * @returns The WhatsApp message id; the webhook reports later statuses under it.
   */
  async sendTemplate(message: WhatsAppTemplateMessage): Promise<{ messageId: string }> {
    const result = await this.graph.postJson<{ messages?: { id?: string }[] }>(
      `${this.requireNumber()}/messages`,
      templatePayload(message),
    );
    const messageId = result.messages?.[0]?.id;
    if (!messageId) throw new RetryableError('Meta accepted the message without a message id');
    return { messageId };
  }

  /**
   * The phone number id, once the sender is configured.
   * @throws DomainError INVALID_STATE with reason NOT_CONNECTED.
   */
  private requireNumber(): string {
    if (!this.isConfigured() || !this.phoneNumberId) {
      throw new DomainError('INVALID_STATE', 'WhatsApp is not connected to Meta.', {
        reason: 'NOT_CONNECTED',
      });
    }
    return this.phoneNumberId;
  }
}
