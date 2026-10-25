// Consent test of the LOCAL demo store (Stage 19): with a Pixel id and a GA4 id set, nothing may reach Meta or Google before the visitor
// chooses; "Only necessary" keeps both off; "Accept" loads both and queues the page view; the choice survives navigation. It sets made-up
// ids for the run and restores the marketing settings afterwards. Needs Chrome, like the screenshot scripts. Chrome is told to refuse
// every request to Meta and Google, so nothing leaves this machine; each attempt is still seen and counted.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:consent
// DOCS_COOKIE (admin session file) and DOCS_BASE point it at another local store (see test:tracking).
import { readFileSync } from 'node:fs';
import { openBrowser, wait } from '../docs/chrome.mjs';
import { BASE, post, sql } from '../docs/shared.mjs';

const cookie = readFileSync(process.env.DOCS_COOKIE ?? '.wrangler/docs-cookie.txt', 'utf8');
const GA4_ID = 'G-TESTCONS01';
const original = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'marketing'")[0]?.value_json ?? '{}',
);
const withTools = {
  ...original,
  metaPixelId: '123456789012345',
  metaCapiEnabled: false,
  ga4MeasurementId: GA4_ID,
  consentBannerMode: 'always',
};

/** Hosts of the two tools. Chrome refuses them, and every attempt is recorded before it is refused. */
const BLOCKED = [
  '*://*.googletagmanager.com/*',
  '*://*.google-analytics.com/*',
  '*://*.facebook.net/*',
  '*://*.facebook.com/*',
];
const THIRD_PARTY = /googletagmanager|google-analytics|facebook\.(com|net)|fbcdn/;

/** Facts the page shows about Meta and GA4 so far: script tags, globals, and the queue gtag fills. */
const probe = `JSON.stringify({
  requests: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /facebook\\.(com|net)|fbcdn/.test(n)).map((n) => new URL(n).host + new URL(n).pathname.slice(0, 22)),
  scripts: [...document.scripts].map((s) => s.src).filter((s) => /facebook/.test(s)).length,
  fbq: typeof window.fbq,
  gaScripts: [...document.scripts].map((s) => s.src).filter((s) => /googletagmanager/.test(s)),
  gtag: typeof window.gtag,
  dataLayer: Array.isArray(window.dataLayer) ? window.dataLayer.map((entry) => Array.from(entry)) : null,
  banner: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => /accept|aceptar|only necessary|necesari/i.test(t)),
  consentCookie: (document.cookie.match(/consent=[^;]+/) || [''])[0],
})`;

const results = [];
const note = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${ok ? '' : detail}`);
};

/** The events gtag queued, as [name, parameters]. The first entries are the `js` and `config` calls. */
const eventsOf = (state) =>
  (state.dataLayer ?? []).filter((entry) => entry[0] === 'event').map((e) => [e[1], e[2]]);
const configOf = (state) => (state.dataLayer ?? []).find((entry) => entry[0] === 'config');

try {
  const saved = await post('/api/admin/settings/marketing', { values: withTools }, cookie);
  console.log('settings saved:', saved.status);
  await wait(1500);

  for (const choice of ['reject', 'accept']) {
    const browser = await openBrowser({
      port: 9440 + (choice === 'accept' ? 1 : 0),
      width: 390,
      height: 844,
      scale: 1,
      mobile: true,
    });
    try {
      const attempts = [];
      browser.onEvent((message) => {
        if (message.method === 'Network.requestWillBeSent') attempts.push(message.params.request.url);
      });
      await browser.cdp('Network.setBlockedURLs', { urls: BLOCKED });
      const thirdParty = () => attempts.filter((url) => THIRD_PARTY.test(url));

      await browser.goto(`${BASE}/en/`, 3500);
      const before = JSON.parse(await browser.evaluate(probe));
      note(
        `[${choice}] before any choice: no request to Meta`,
        before.requests.length === 0 && before.scripts === 0 && before.fbq === 'undefined',
        JSON.stringify(before),
      );
      note(
        `[${choice}] before any choice: no request to Google, no gtag, no queue`,
        before.gaScripts.length === 0 && before.gtag === 'undefined' && before.dataLayer === null,
        JSON.stringify({ gaScripts: before.gaScripts, gtag: before.gtag, dataLayer: before.dataLayer }),
      );
      note(
        `[${choice}] before any choice: the browser tried to reach neither`,
        thirdParty().length === 0,
        thirdParty().join(' | '),
      );
      note(
        `[${choice}] the banner offers both choices`,
        before.banner.length >= 2,
        before.banner.join(' | '),
      );
      const region = await browser.evaluate(
        `(() => { const r = document.querySelector('[role="region"][aria-label]'); return r ? r.getAttribute('aria-label') : null; })()`,
      );
      note(`[${choice}] the banner is a named region`, Boolean(region), String(region));

      const wanted = choice === 'accept' ? /accept|aceptar/i : /only necessary|necesari/i;
      await browser.evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find((x) => ${wanted}.test(x.innerText)); b?.click(); })()`,
      );
      await wait(3000);
      const after = JSON.parse(await browser.evaluate(probe));
      if (choice === 'reject') {
        note(
          '[reject] after rejecting: still no request to Meta',
          after.requests.length === 0 && after.scripts === 0,
          JSON.stringify(after),
        );
        note(
          '[reject] after rejecting: still no request to Google, nothing queued',
          after.gaScripts.length === 0 && after.gtag === 'undefined' && after.dataLayer === null,
          JSON.stringify({ gaScripts: after.gaScripts, dataLayer: after.dataLayer }),
        );
        note(
          '[reject] after rejecting: the browser still tried to reach neither',
          thirdParty().length === 0,
          thirdParty().join(' | '),
        );
      } else {
        note(
          '[accept] after accepting: the Pixel loads',
          after.requests.length > 0 || after.scripts > 0,
          JSON.stringify(after),
        );
        note(
          "[accept] after accepting: gtag.js is requested for the store's id",
          after.gaScripts.length === 1 && after.gaScripts[0].includes(`id=${GA4_ID}`),
          JSON.stringify(after.gaScripts),
        );
        const config = configOf(after);
        note(
          '[accept] gtag is configured with that id and sends no automatic page view',
          config?.[1] === GA4_ID && config?.[2]?.send_page_view === false,
          JSON.stringify(config),
        );
        const views = eventsOf(after).filter(([name]) => name === 'page_view');
        note(
          '[accept] exactly one page_view is queued for this page',
          views.length === 1,
          JSON.stringify(eventsOf(after)),
        );
        note(
          '[accept] the browser requested gtag.js and the Pixel script',
          thirdParty().some((url) => /googletagmanager\.com\/gtag\/js\?id=G-TESTCONS01/.test(url)) &&
            thirdParty().some((url) => /connect\.facebook\.net/.test(url)),
          thirdParty().join(' | '),
        );
      }
      // The choice must survive a reload.
      await browser.goto(`${BASE}/en/shop`, 3500);
      const reloaded = JSON.parse(await browser.evaluate(probe));
      const loaded = reloaded.requests.length > 0 || reloaded.scripts > 0;
      note(
        `[${choice}] next page keeps the choice (Pixel ${choice === 'accept' ? 'loads' : 'stays off'})`,
        loaded === (choice === 'accept'),
        JSON.stringify({ cookie: reloaded.consentCookie, requests: reloaded.requests.length }),
      );
      const gaLoaded = reloaded.gaScripts.length > 0;
      note(
        `[${choice}] next page keeps the choice (GA4 ${choice === 'accept' ? 'loads' : 'stays off'})`,
        gaLoaded === (choice === 'accept') && (choice === 'accept' || reloaded.dataLayer === null),
        JSON.stringify({ gaScripts: reloaded.gaScripts, dataLayer: reloaded.dataLayer }),
      );
    } finally {
      browser.close();
    }
  }
} finally {
  const restored = await post('/api/admin/settings/marketing', { values: original }, cookie);
  console.log('settings restored:', restored.status);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = results.every(Boolean) ? 0 : 1;
