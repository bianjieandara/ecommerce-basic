// Where the demo store keeps the e-mails it did not send (EMAIL_TRANSPORT=outbox). The sender writes here and the reset deletes here.

/**
 * Object key of one outbox message.
 * @param id Message id, which the notification log keeps as its provider message id.
 * @returns The key in the store's object storage.
 */
export function outboxKey(id: string): string {
  return `outbox/${id}.json`;
}
