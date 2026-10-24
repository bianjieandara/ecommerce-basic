// Google Analytics identity of a visitor, read from the cookies GA4 sets once the visitor accepted marketing. The server keeps it
// on the order so the purchase it sends later (Measurement Protocol) joins the same visitor and session as the browser events.
import { readCookie, readCookiesWithPrefix } from '../shared/cookies';

/** Who GA4 knows this visitor as. */
export interface GaIdentity {
  /** The visitor id, for example "1234567890.1700000000". */
  clientId: string;
  /** The session id, or null when the session cookie is missing or unreadable. */
  sessionId: string | null;
}

/** Cookie with the client id: `GA1.<domain depth>.<id>.<first visit>`. */
const CLIENT_COOKIE = '_ga';

/** Session cookies are `_ga_<measurement id without "G-">`. */
const SESSION_COOKIE_PREFIX = '_ga_';

/**
 * Reads the client id out of the value of `_ga`.
 * @param value Cookie value, for example `GA1.1.1234567890.1700000000`.
 * @returns The id (the last two parts), or null when the value has another shape.
 */
export function parseGaClientId(value: string): string | null {
  const match = /^GA\d+\.\d+\.(\d{1,12}\.\d{1,12})$/.exec(value);
  return match?.[1] ?? null;
}

/**
 * Reads the session id out of the value of a `_ga_<id>` cookie. GA4 writes two formats: `GS1.1.<session>.<count>...` (older)
 * and `GS2.1.s<session>$o<count>...` (current).
 * @param value Cookie value.
 * @returns The session id (a Unix time in seconds), or null when the value has another shape.
 */
export function parseGaSessionId(value: string): string | null {
  const dotted = /^GS1\.\d+\.(\d{9,12})\./.exec(value);
  if (dotted?.[1]) return dotted[1];
  const dollar = /^GS2\.\d+\.s(\d{9,12})(?:\$|$)/.exec(value);
  return dollar?.[1] ?? null;
}

/**
 * Reads the visitor's GA identity from a Cookie header. Call it only when the visitor granted marketing: without consent GA4 sets
 * no cookies, and this identity must not be stored.
 * @param cookieHeader Cookie header of the request, or null.
 * @returns The identity, or null when there is no usable `_ga` cookie.
 */
export function readGaIdentity(cookieHeader: string | null): GaIdentity | null {
  const clientId = parseGaClientId(readCookie(cookieHeader, CLIENT_COOKIE) ?? '');
  if (clientId === null) return null;
  const sessionId =
    readCookiesWithPrefix(cookieHeader, SESSION_COOKIE_PREFIX)
      .map((cookie) => parseGaSessionId(cookie.value))
      .find((id) => id !== null) ?? null;
  return { clientId, sessionId };
}
