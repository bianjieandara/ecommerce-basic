// Reading cookies from a Cookie header or from `document.cookie`. Pure: nothing here reads or writes a cookie itself.

/**
 * Finds the value of one cookie.
 * @param cookieHeader Full cookie string, or null when there are no cookies.
 * @param name Cookie name, matched exactly.
 * @returns The raw value, or null when the cookie is absent.
 */
export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * Lists the cookies whose name starts with a prefix.
 * @param cookieHeader Full cookie string, or null when there are no cookies.
 * @param prefix Start of the cookie name.
 * @returns Name and raw value of each match, in header order.
 */
export function readCookiesWithPrefix(
  cookieHeader: string | null,
  prefix: string,
): { name: string; value: string }[] {
  if (!cookieHeader) return [];
  const found: { name: string; value: string }[] = [];
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    const name = eq === -1 ? '' : part.slice(0, eq).trim();
    if (name.startsWith(prefix)) found.push({ name, value: part.slice(eq + 1).trim() });
  }
  return found;
}
