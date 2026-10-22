// Campaign attribution of the visit: UTM values and the Meta click id. sessionStorage carries it to the checkout form;
// the _fbc cookie carries the click id to the Pixel once the visitor grants marketing.

/** Session key of the stored attribution. The checkout form sends it with the order (see readAttribution). */
const STORAGE_KEY = 'attribution';

/** Lifetime of the _fbc cookie: 90 days, the window Meta uses for click attribution. */
const FBC_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

/** Longest value kept for one field. The order endpoint accepts up to 200 characters per value. */
const MAX_VALUE_LENGTH = 200;

/** Meta click ids are URL-safe tokens; anything else is ignored rather than stored. */
const FBCLID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

/** Campaign parameters kept from a landing URL. */
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign'] as const;

/**
 * Reads the attribution saved from the landing page. Returns an empty object when none exists or the stored value is unreadable.
 * @returns Attribution fields: utm_source, utm_medium, utm_campaign and fbc, when present.
 */
export function readAttribution(): Record<string, string> {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Saves the campaign parameters of a landing URL. A landing that carries none keeps the earlier attribution, so that
 * browsing on after a campaign visit does not lose it; a landing that carries some replaces the earlier values.
 * @param search Query string of the landing URL (location.search).
 */
export function captureAttribution(search: string): void {
  const params = new URLSearchParams(search);
  const found: Record<string, string> = {};
  for (const key of UTM_PARAMS) {
    const value = (params.get(key) ?? '').trim().slice(0, MAX_VALUE_LENGTH);
    if (value) found[key] = value;
  }
  const fbclid = params.get('fbclid') ?? '';
  // The fb.1.<time in ms>.<click id> format is the one Meta's Pixel and Conversions API read.
  if (FBCLID_PATTERN.test(fbclid)) found.fbc = `fb.1.${Date.now()}.${fbclid}`;
  if (Object.keys(found).length === 0) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(found));
  } catch {
    // Storage can be blocked; attribution is then simply not sent with the order.
  }
}

/**
 * Writes the _fbc cookie from the stored click id. Call it only after marketing is granted: the cookie identifies the
 * visitor's ad click to Meta, so it is a marketing cookie.
 */
export function syncFbcCookie(): void {
  const fbc = readAttribution().fbc;
  if (!fbc) return;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `_fbc=${fbc}; Path=/; Max-Age=${FBC_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}
