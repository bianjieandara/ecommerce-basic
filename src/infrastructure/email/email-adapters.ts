// Email adapters: Cloudflare Email Service in production, a console logger when the binding is missing (local dev).
import { outboxKey } from '@/application/notifications/outbox';
import type { MediaStorage } from '@/application/ports/media';
import type { EmailAttachment, EmailSender } from '@/application/ports/platform';

/** Largest total message size Email Service accepts, including attachments. */
const MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

/** Sends through the `send_email` binding (Cloudflare Email Service). */
export class CloudflareEmailSender implements EmailSender {
  /**
   * @param binding The EMAIL send_email binding.
   * @param from Sender address from the EMAIL_FROM var.
   */
  constructor(
    private readonly binding: SendEmail,
    private readonly from: string,
  ) {}

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
    replyTo?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ messageId: string }> {
    const attachments = (message.attachments ?? []).map((file) => ({
      content: toBase64(file.content),
      filename: file.filename,
      type: file.contentType,
      disposition: 'attachment' as const,
    }));
    const size = attachments.reduce((sum, file) => sum + file.content.length, 0) + message.html.length;
    if (size > MAX_MESSAGE_BYTES) throw new Error('Email exceeds the 5 MiB limit');

    const result = await this.binding.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });
    return { messageId: result.messageId };
  }
}

/**
 * Local development sender: logs the message instead of sending it. The text body is logged too, so the links in reset
 * and invitation emails can be followed while developing.
 */
export class ConsoleEmailSender implements EmailSender {
  async send(message: {
    to: string;
    subject: string;
    text?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ messageId: string }> {
    // Attachments are listed by name and size, so a developer can see that an email carries its PDF without a mailbox.
    const files = (message.attachments ?? []).map(
      (file) => `${file.filename} (${file.content.byteLength} bytes)`,
    );
    const attached = files.length > 0 ? ` attachments=[${files.join(', ')}]` : '';
    console.log(`[email:dev] to=${message.to} subject=${message.subject}${attached}\n${message.text ?? ''}`);
    return { messageId: `dev-${Date.now()}` };
  }
}

/**
 * Demo sender: keeps each message in object storage instead of sending it, so a prospect can read what the store wrote, and no
 * real address receives anything. Attachments are recorded by name and size; their bytes are kept with the invoice itself.
 */
export class OutboxEmailSender implements EmailSender {
  /**
   * @param storage Object storage the messages are kept in.
   * @param newId Identifier generator, which also becomes the message id the notification log keeps.
   */
  constructor(
    private readonly storage: MediaStorage,
    private readonly newId: () => string,
  ) {}

  async send(message: {
    to: string;
    subject: string;
    html: string;
    text?: string;
    attachments?: EmailAttachment[];
  }): Promise<{ messageId: string }> {
    const id = this.newId();
    const record = {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? '',
      sentAt: new Date().toISOString(),
      attachments: (message.attachments ?? []).map((file) => ({
        filename: file.filename,
        bytes: file.content.byteLength,
      })),
    };
    await this.storage.put(
      outboxKey(id),
      new TextEncoder().encode(JSON.stringify(record)).buffer,
      'application/json',
    );
    return { messageId: id };
  }
}

/**
 * Base64-encodes an ArrayBuffer for the Email Service attachment format.
 * @param buffer Bytes to encode.
 * @returns Base64 text.
 */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
