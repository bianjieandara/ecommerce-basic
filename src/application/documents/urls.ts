// Absolute URLs for emails and documents. The paths come from domain/shared/paths.ts; this only joins them to the site.

/**
 * Joins the public site URL and a path. Trailing slashes on the site URL are ignored, so "/" is never doubled.
 * @param siteUrl Base URL from the PUBLIC_SITE_URL var.
 * @param path Path that starts with "/".
 * @returns Absolute URL.
 */
export function absoluteUrl(siteUrl: string, path: string): string {
  return `${siteUrl.replace(/\/+$/, '')}${path}`;
}
