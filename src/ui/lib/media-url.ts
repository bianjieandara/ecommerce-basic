// Media URLs. The only module that builds image URLs for the UI. With `PUBLIC_MEDIA_BASE_URL` set (an R2 custom domain), images
// are served from that host and never reach the Worker; without it they use the Worker's /media route.
import type { MediaVariant } from '@/domain/media/media-asset';
import { mediaOrigin as originOf } from '@/domain/media/media-base';
import { PATHS } from '@/domain/shared/paths';

/**
 * The store's media base, set by the middleware on each request. A module value is safe here because it comes from the Worker's
 * environment, which is the same for every request this Worker serves; it is not per-visitor state.
 */
let configuredBase = '';

/**
 * Sets the address images are served from.
 * @param base A value from `normalizeMediaBase` (empty for this site's /media route).
 */
export function configureMediaBase(base: string): void {
  configuredBase = base;
}

/**
 * Origin of the media host, for a `preconnect` hint.
 * @returns The origin, or an empty string when images come from this site.
 */
export function mediaOrigin(): string {
  return originOf(configuredBase);
}

/**
 * Public URL of a stored media key.
 * @param key R2 object key, for example "media/<id>/480.webp".
 * @param publicBase Public base URL; defaults to the store's setting. Empty means use the Worker route.
 * @returns URL path or absolute URL.
 */
export function mediaUrl(key: string, publicBase = configuredBase): string {
  return PATHS.media(key, publicBase);
}

/**
 * URL of the largest stored variant, for a sharing card. A scraper takes one picture and no srcset: WhatsApp, Facebook
 * and X crop it to around 1200x630 and ignore anything small, so the widest size is always the right one to hand over.
 * @param variants Stored sizes of one image; an empty list means there is no picture to share.
 * @param publicBase Public base URL; defaults to the store's setting.
 * @returns URL of the widest variant, or null when there is none.
 */
export function largestVariantUrl(
  variants: Pick<MediaVariant, 'width' | 'key'>[],
  publicBase = configuredBase,
): string | null {
  const widest = [...variants].sort((a, b) => b.width - a.width)[0];
  return widest ? mediaUrl(widest.key, publicBase) : null;
}

/**
 * Builds a srcset value from stored variants, for responsive images.
 * @param variants Stored sizes of one image.
 * @param publicBase Public base URL; defaults to the store's setting.
 * @returns srcset text, for example "/media/... 480w, /media/... 960w".
 */
export function buildSrcSet(
  variants: Pick<MediaVariant, 'width' | 'key'>[],
  publicBase = configuredBase,
): string {
  return [...variants]
    .sort((a, b) => a.width - b.width)
    .map((variant) => `${mediaUrl(variant.key, publicBase)} ${variant.width}w`)
    .join(', ');
}
