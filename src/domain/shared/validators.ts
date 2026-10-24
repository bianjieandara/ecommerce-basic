// Checks for settings values that other code feeds to the platform (time zones to Intl, links to href attributes).

/**
 * True when Intl knows the time zone. A value Intl rejects makes every date shown in the admin throw, so settings refuse it.
 * @param value IANA time zone name, for example "America/Bogota".
 * @returns True when dates can be formatted in it.
 */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return value.length > 0;
  } catch {
    return false;
  }
}

/**
 * True for a two-letter region code that Intl names, so "ZZ" and "XX" are refused.
 * @param value ISO 3166-1 alpha-2 code, for example "CO".
 * @returns True when the code is a known region.
 */
export function isKnownCountry(value: string): boolean {
  if (!/^[A-Za-z]{2}$/.test(value)) return false;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(value.toUpperCase());
    return name !== undefined && name !== value.toUpperCase() && name !== 'Unknown Region';
  } catch {
    return false;
  }
}

/**
 * True for a link that is safe to put in an href: a path on this store, an https address or a mailto. A path starting with
 * "//" or "/\" is not a path on this store (browsers read it as another host), and any other scheme, such as javascript:, is refused.
 * @param value Link as typed in the admin.
 * @returns True when the link is allowed.
 */
export function isSafeHref(value: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
  return value.startsWith('https://') || value.startsWith('mailto:');
}

/**
 * True for an https address, the only kind a social profile link may be.
 * @param value Link as typed in the admin.
 * @returns True when it starts with https:// and parses as a URL.
 */
export function isHttpsUrl(value: string): boolean {
  if (!value.startsWith('https://')) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
