// Consent test of the LOCAL demo store (Stage 19): with a Pixel id set, nothing may reach Meta before the visitor chooses; "Only
// necessary" keeps the Pixel off; "Accept" loads it; the choice survives navigation. It sets a made-up Pixel id for the run and restores
// the marketing settings afterwards. Needs Chrome, like the screenshot scripts.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:consent
import { readFileSync } from 'node:fs';
import { openBrowser, wait } from '../docs/chrome.mjs';
import { BASE, post, sql } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const original = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'marketing'")[0]?.value_json ?? '{}',
);
const withPixel = {
  ...original,
  metaPixelId: '123456789012345',
  metaCapiEnabled: false,
  consentBannerMode: 'always',
};

/** Hosts and script tags that belong to Meta, as the page has loaded them so far. */
const probe = `JSON.stringify({
  requests: performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /facebook\\.(com|net)|fbcdn/.test(n)).map((n) => new URL(n).host + new URL(n).pathname.slice(0, 22)),
  scripts: [...document.scripts].map((s) => s.src).filter((s) => /facebook/.test(s)).length,
  fbq: typeof window.fbq,
  banner: [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => /accept|aceptar|only necessary|necesari/i.test(t)),
  consentCookie: (document.cookie.match(/consent=[^;]+/) || [''])[0],
})`;

const results = [];
const note = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};

try {
  const saved = await post('/api/admin/settings/marketing', { values: withPixel }, cookie);
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
      await browser.goto(`${BASE}/en/`, 3500);
      const before = JSON.parse(await browser.evaluate(probe));
      note(
        `[${choice}] before any choice: no request to Meta`,
        before.requests.length === 0 && before.scripts === 0 && before.fbq === 'undefined',
        JSON.stringify(before),
      );
      note(
        `[${choice}] the banner offers both choices`,
        before.banner.length >= 2,
        before.banner.join(' | '),
      );

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
      } else {
        note(
          '[accept] after accepting: the Pixel loads',
          after.requests.length > 0 || after.scripts > 0,
          JSON.stringify(after),
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
    } finally {
      browser.close();
    }
  }
} finally {
  const restored = await post('/api/admin/settings/marketing', { values: original }, cookie);
  console.log('settings restored:', restored.status);
}
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
