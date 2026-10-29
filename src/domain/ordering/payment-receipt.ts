// What a proof of payment may be and where its bytes live. The endpoint, the use case and the screens all read the rules
// here, so the limit a form announces is the one the server enforces.

/** Picture formats a phone camera or a banking app produces, plus the PDF some banks hand out. */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;

/** One accepted content type. */
export type ReceiptType = (typeof RECEIPT_TYPES)[number];

/** File name extension of each accepted type, so a downloaded receipt opens in the right program. */
const EXTENSIONS: Record<ReceiptType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

/**
 * Largest receipt accepted, in bytes. A photo straight from a phone is around 3 MB; 8 leaves room without letting the
 * upload become a way to fill the bucket.
 */
export const MAX_RECEIPT_BYTES = 8 * 1024 * 1024;

/**
 * Whether a content type may be stored as a receipt.
 * @param type Content type as the browser declared it.
 * @returns True for the accepted types.
 */
export function isReceiptType(type: string): type is ReceiptType {
  return (RECEIPT_TYPES as readonly string[]).includes(type);
}

/**
 * Where a receipt's bytes go. The random part makes a second upload a new object, so a reader holding the old key never
 * sees the new receipt, and the old object is deleted only after the order points at the new one.
 * @param orderId Order the receipt belongs to.
 * @param type Content type being stored.
 * @param id Unique part of the name.
 * @returns The R2 key.
 */
export function receiptKey(orderId: string, type: ReceiptType, id: string): string {
  return `receipts/${orderId}/${id}.${EXTENSIONS[type]}`;
}

/**
 * The content type a stored key holds, read back from its extension. A key written by an older version with an unknown
 * extension is served as a download rather than guessed at.
 * @param key Stored R2 key.
 * @returns The content type, or null when the extension is unknown.
 */
export function receiptTypeOf(key: string): ReceiptType | null {
  const extension = key.slice(key.lastIndexOf('.') + 1);
  const found = (Object.entries(EXTENSIONS) as [ReceiptType, string][]).find(
    ([, value]) => value === extension,
  );
  return found ? found[0] : null;
}
