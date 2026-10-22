// Media rules. Every upload is resized in the browser to these widths and stored as WebP (or JPEG as a fallback). The
// server checks the bytes itself, so a renamed file cannot pass as an image.

/** Widths generated for each upload, in pixels, from the smallest to the largest. */
export const MEDIA_WIDTHS = [480, 960, 1600] as const;

/** Largest accepted upload (all variants together), in bytes. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Image types recognised by their first bytes. Uploaded originals may be any of these. */
export const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Formats of the stored variants. PNG is not stored: for photos it is much larger than WebP or JPEG. */
export type VariantMime = 'image/webp' | 'image/jpeg';

/** One stored size of an image. */
export interface MediaVariant {
  width: number;
  key: string;
  bytes: number;
}

const EXTENSION: Record<VariantMime, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' };
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Recognises an image by its first bytes (magic numbers), ignoring the file name and any declared type.
 * @param bytes First bytes of the file; 12 are enough for every supported format.
 * @returns The image type, or null when the bytes are not a supported image.
 */
export function sniffImageMime(bytes: Uint8Array): (typeof ACCEPTED_MEDIA_TYPES)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Reads ASCII text from a byte range.
 * @param bytes Source bytes.
 * @param start First index.
 * @param end Index after the last byte.
 * @returns The text (shorter when the bytes end early).
 */
function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

/**
 * True for the formats the browser produces for stored variants.
 * @param mime Detected or declared type.
 * @returns Whether the type can be stored as a variant.
 */
export function isVariantMime(mime: string): mime is VariantMime {
  return mime === 'image/webp' || mime === 'image/jpeg';
}

/**
 * R2 key of one stored size: media/<asset id>/<width>.<extension>.
 * @param assetId Asset id.
 * @param width Width in pixels.
 * @param mime Stored format.
 * @returns The object key.
 */
export function mediaVariantKey(assetId: string, width: number, mime: VariantMime): string {
  return `media/${assetId}/${width}.${EXTENSION[mime]}`;
}
