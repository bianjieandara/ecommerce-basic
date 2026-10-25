// A stand-in for GA4's Measurement Protocol (POST /mp/collect), so the server-side purchase can be tested on this machine with no Google
// account. Like Google's collector it answers 204 whatever the body holds, so a wrong request never shows as an HTTP error; instead it
// applies the rules Google documents (a measurement id and the API secret in the query, a client id, a named event, and for a purchase
// a transaction id, a currency, a value and items) and lists the problems it found next to each recorded request.
//
// Usage: imported by scripts/test/tracking.mjs (startFakeGa4). The local store reaches it through GA4_MP_BASE_URL (store.mjs --tracking).
import { createServer } from 'node:http';

/** Port the local store is given (see DEMO_TRACKING_VARS in scripts/docs/shared.mjs). */
export const GA4_PORT = Number(process.env.DOCS_GA4_PORT ?? 5830);

/**
 * Starts the fake. Call `close()` when done.
 * @param port Port to listen on.
 * @param expected The measurement id and API secret the store is configured with; others are listed as problems.
 * @returns The server handle and the recorded requests, oldest first.
 */
export async function startFakeGa4(port = GA4_PORT, expected = {}) {
  /** Every request received: path, query, parsed body and the problems found. */
  const requests = [];

  /** Rules of the protocol that Google documents; returns what is wrong with one request. */
  function problemsOf(path, query, body) {
    const problems = [];
    if (path !== '/mp/collect') problems.push(`unexpected path ${path}`);
    if (!/^G-[A-Z0-9]{4,12}$/.test(query.measurement_id ?? ''))
      problems.push('measurement_id is missing or malformed');
    if (expected.measurementId && query.measurement_id !== expected.measurementId)
      problems.push("measurement_id is not the store's");
    if (!query.api_secret) problems.push('api_secret is missing');
    if (expected.apiSecret && query.api_secret !== expected.apiSecret)
      problems.push("api_secret is not the store's");
    if (!body || typeof body !== 'object') return [...problems, 'the body is not JSON'];
    if (!body.client_id) problems.push('client_id is missing');
    if (!Array.isArray(body.events) || body.events.length === 0) return [...problems, 'events is empty'];
    for (const event of body.events) {
      if (!event.name) problems.push('an event has no name');
      if (event.name !== 'purchase') continue;
      const p = event.params ?? {};
      if (!p.transaction_id) problems.push('purchase without transaction_id');
      if (!/^[A-Z]{3}$/.test(p.currency ?? '')) problems.push('purchase without a currency');
      if (typeof p.value !== 'number') problems.push('purchase value is not a number');
      if (!Array.isArray(p.items) || p.items.length === 0) problems.push('purchase without items');
      for (const item of p.items ?? []) if (!item.item_id) problems.push('an item has no item_id');
    }
    return problems;
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      let body = null;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        body = null;
      }
      const query = Object.fromEntries(url.searchParams);
      requests.push({
        method: request.method,
        path: url.pathname,
        query,
        body,
        problems: problemsOf(url.pathname, query, body),
      });
      response.writeHead(204);
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });

  return {
    requests,
    /** Forgets the recorded requests. */
    reset() {
      requests.length = 0;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
