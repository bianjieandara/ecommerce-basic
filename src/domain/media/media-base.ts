// The public address images are served from when the store uses an R2 custom domain instead of the Worker's /media route.

/**
 * Reads the `PUBLIC_MEDIA_BASE_URL` setting. The value ends up in every `src`, so only a plain web origin or folder is accepted:
 * `https://media.example.com`, or `https://cdn.example.com/shop` for a shared host. A trailing slash is dropped. Plain `http` is
 * accepted only for a local address, so a store never serves pictures a browser would block as mixed content.
 * @param raw The setting as written. Empty means "serve images from this site".
 * @returns The address without a trailing slash, or an empty string for an empty or unusable value (images then keep coming from
 * this site, so a typo in the setting costs speed, never the pictures).
 */
export function normalizeMediaBase(raw: string | null | undefined): string {
  const text = (raw ?? '').trim();
  if (text === '') return '';
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return '';
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const protocolOk = url.protocol === 'https:' || (url.protocol === 'http:' && local);
  if (!protocolOk || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '')
    return '';
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Scheme and host of a media base, for a `preconnect` hint.
 * @param base A value returned by `normalizeMediaBase`.
 * @returns The origin, or an empty string when images come from this site.
 */
export function mediaOrigin(base: string): string {
  return base === '' ? '' : new URL(base).origin;
}
