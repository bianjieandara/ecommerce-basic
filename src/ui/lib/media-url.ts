// Media URLs. The only module that builds image URLs for the UI, so a CDN base URL can be added in one place.
import type { MediaVariant } from '@/domain/media/media-asset';

/**
 * Public URL of a stored media key.
 * @param key R2 object key, for example "media/<id>/480.webp".
 * @param publicBase Optional public base URL (for a custom domain on R2); empty means use the Worker route.
 * @returns URL path or absolute URL.
 */
export function mediaUrl(key: string, publicBase = ''): string {
  return publicBase ? `${publicBase.replace(/\/$/, '')}/${key}` : `/media/${key}`;
}

/**
 * Builds a srcset value from stored variants, for responsive images.
 * @param variants Stored sizes of one image.
 * @param publicBase Optional public base URL.
 * @returns srcset text, for example "/media/... 480w, /media/... 960w".
 */
export function buildSrcSet(variants: MediaVariant[], publicBase = ''): string {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${mediaUrl(variant.key, publicBase)} ${variant.width}w`)
    .join(', ');
}
