// Cookie consent model. The visitor's marketing choice lives in one readable cookie (v1.m1 granted, v1.m0 refused) shared by
// the server, the banner and the tests. Pure rules only: nothing here reads or writes a cookie itself.

import { readCookie } from '../shared/cookies';

/** Cookie that stores the consent choice. The server reads it, so it can decide whether marketing events may be sent. */
export const CONSENT_COOKIE_NAME = 'consent';

/** Format version of the cookie value. Any other version counts as "not chosen", so visitors are asked again. */
export const CONSENT_VERSION = 'v1';

/** Lifetime of a choice in seconds (365 days). */
export const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Consent categories. `necessary` is always on and is not a choice; `marketing` covers the Meta Pixel, the Conversions API and Google Analytics 4. */
export const CONSENT_CATEGORIES = ['necessary', 'marketing'] as const;

/** A consent category. */
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

/** When the banner appears: `auto` only when a marketing tool is configured, `always` on every store. */
export const CONSENT_BANNER_MODES = ['auto', 'always'] as const;

/** A banner mode, as stored in the `consentBannerMode` setting. */
export type ConsentBannerMode = (typeof CONSENT_BANNER_MODES)[number];

/** A parsed consent choice. Both fields are null when the cookie is missing, malformed or from another version. */
export interface Consent {
  version: typeof CONSENT_VERSION | null;
  /** True when marketing is granted, false when refused, null when the visitor has not chosen yet. */
  marketing: boolean | null;
}

const NOT_CHOSEN: Consent = { version: null, marketing: null };

/**
 * Reads the consent cookie value. Unknown or malformed values are treated as "not chosen" rather than as refusal,
 * so a future format change asks the visitor again instead of silently blocking or allowing tracking.
 * @param cookieValue Raw value of the `consent` cookie, or null when the cookie is absent.
 * @returns The parsed choice.
 */
export function parseConsent(cookieValue: string | null): Consent {
  const [version, marketingPart, ...extra] = (cookieValue ?? '').split('.');
  if (version !== CONSENT_VERSION || extra.length > 0) return NOT_CHOSEN;
  if (marketingPart === 'm1') return { version: CONSENT_VERSION, marketing: true };
  if (marketingPart === 'm0') return { version: CONSENT_VERSION, marketing: false };
  return NOT_CHOSEN;
}

/**
 * Builds the cookie value for a marketing choice.
 * @param marketing True when the visitor accepts marketing, false when they refuse it.
 * @returns The value to store, for example `v1.m1`.
 */
export function serializeConsent(marketing: boolean): string {
  return `${CONSENT_VERSION}.${marketing ? 'm1' : 'm0'}`;
}

/**
 * Whether marketing events (Pixel in the browser, Conversions API on the server) may run.
 * Only an explicit grant counts: a missing choice is treated as refusal.
 * @param consent Parsed choice.
 * @returns True only when the visitor granted marketing.
 */
export function marketingAllowed(consent: Consent): boolean {
  return consent.marketing === true;
}

/** Shape of a Google Analytics 4 measurement ID, for example G-ABC123XYZ. The setting may also be empty (no GA4). */
export const GA4_MEASUREMENT_ID = /^G-[A-Z0-9]{4,12}$/;

/**
 * Whether a marketing tool is configured. The banner in `auto` mode is only worth showing when there is something to consent to.
 * @param metaPixelId The `metaPixelId` setting (empty when unset).
 * @param metaCapiEnabled The `metaCapiEnabled` setting.
 * @param ga4MeasurementId The `ga4MeasurementId` setting (empty when unset). GA4 sets cookies, so it runs under the same consent.
 * @returns True when the Pixel or GA4 has an ID, or the Conversions API is switched on.
 */
export function isMarketingToolEnabled(
  metaPixelId: string,
  metaCapiEnabled: boolean,
  ga4MeasurementId: string,
): boolean {
  return metaPixelId.trim().length > 0 || metaCapiEnabled || ga4MeasurementId.trim().length > 0;
}

/**
 * Decides whether the banner must be shown for this visitor. A visitor who already chose never sees it again
 * (the "Privacy settings" link clears the choice); otherwise `always` shows it everywhere and `auto` only with a marketing tool.
 * @param mode The `consentBannerMode` setting.
 * @param marketingToolEnabled Result of `isMarketingToolEnabled`.
 * @param consent Parsed choice for this visitor.
 * @returns True when the banner should be displayed.
 */
export function bannerRequired(
  mode: ConsentBannerMode,
  marketingToolEnabled: boolean,
  consent: Consent,
): boolean {
  if (consent.marketing !== null) return false;
  return mode === 'always' || marketingToolEnabled;
}

/**
 * Finds the consent cookie in a Cookie header or in `document.cookie`.
 * @param cookieHeader Full cookie string, or null when there are no cookies.
 * @returns The raw value of the consent cookie, or null when it is absent.
 */
export function consentCookieValue(cookieHeader: string | null): string | null {
  return readCookie(cookieHeader, CONSENT_COOKIE_NAME);
}

/**
 * Builds the string assigned to `document.cookie` to store a choice, or to forget it.
 * Forgetting uses an expiry in the past (both Max-Age and Expires, for old browsers) so the banner appears again.
 * @param value Cookie value from `serializeConsent`, or null to clear the choice.
 * @param secure True on https, so the cookie is never sent over plain http.
 * @returns The cookie assignment string.
 */
export function consentCookieString(value: string | null, secure: boolean): string {
  const attributes =
    value === null
      ? ['Path=/', 'Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'SameSite=Lax']
      : ['Path=/', `Max-Age=${CONSENT_MAX_AGE_SECONDS}`, 'SameSite=Lax'];
  if (secure) attributes.push('Secure');
  return [`${CONSENT_COOKIE_NAME}=${value ?? ''}`, ...attributes].join('; ');
}
