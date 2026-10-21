// Media rules. Every upload is resized in the browser to these widths and stored as WebP (or JPEG as a fallback).

/** Widths generated for each upload, in pixels, from the smallest to the largest. */
export const MEDIA_WIDTHS = [480, 960, 1600] as const;

/** Largest accepted upload, before resizing. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** One stored size of an image. */
export interface MediaVariant {
  width: number;
  key: string;
  bytes: number;
}

/** Image types accepted by the upload endpoint. */
export const ACCEPTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
