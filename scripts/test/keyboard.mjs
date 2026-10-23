// Keyboard and focus test of the LOCAL demo store, in Chrome. It checks the things a mouse user never notices: the first Tab stop,
// that dialogs (search, cart drawer, the filter drawer on a phone, the cookie banner) open and close from the keyboard, that Escape
// closes them and returns focus to the button that opened them, that Tab cannot leave an open dialog, and that every link, button and
// field on the main pages shows a visible focus ring.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:keyboard
import { openBrowser, wait } from '../docs/chrome.mjs';
import { BASE, post, sql } from '../docs/shared.mjs';
import { readFileSync } from 'node:fs';

const results = [];
const failures = [];
/**
 * Records one check.
 * @param name What was checked.
 * @param ok Whether it passed.
 * @param detail Shown when it failed.
 */
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures.push(name);
}

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const original = JSON.parse(
  sql("SELECT value_json FROM settings WHERE group_key = 'marketing'")[0].value_json,
);
// The consent banner only shows when a tool needs consent, so the run switches on a made-up Pixel id.
await post(
  '/api/admin/settings/marketing',
  { values: { ...original, metaPixelId: '123456789012345', consentBannerMode: 'always' } },
  cookie,
);
await wait(1200);

/**
 * Presses a key as the keyboard would, with its key code.
 * @param browser Chrome session.
 * @param key Key name, for example "Tab" or "Escape".
 * @param shift Whether Shift is held.
 */
async function press(browser, key, shift = false) {
  const codes = { Tab: 9, Escape: 27, Enter: 13, ' ': 32 };
  const base = {
    key,
    code: key === ' ' ? 'Space' : key,
    windowsVirtualKeyCode: codes[key] ?? 0,
    modifiers: shift ? 8 : 0,
  };
  await browser.cdp('Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...base,
    text: key === 'Enter' ? '\r' : undefined,
  });
  await browser.cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await wait(250);
}
const active = (browser) =>
  browser.evaluate(
    `(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; return e.tagName.toLowerCase() + '|' + (e.getAttribute('aria-label') || e.innerText || e.getAttribute('href') || e.name || '').replace(/\\s+/g, ' ').trim().slice(0, 40) + '|' + Boolean(e.closest('[role=dialog], dialog[open]')); })()`,
  );

try {
  // ------------------------------------------------------------------------------------------------------------ desktop
  const desktop = await openBrowser({ port: 9470, width: 1200, height: 900, scale: 1, mobile: false });
  try {
    await desktop.goto(`${BASE}/en/`, 3000);
    await press(desktop, 'Tab');
    const first = await active(desktop);
    check(
      'the first Tab stop is the skip-to-content link',
      /skip to content|saltar al contenido/i.test(first),
      first,
    );
    const hasSkip = await desktop.evaluate(
      `Boolean([...document.querySelectorAll('a')].find((a) => /skip|saltar|ir al contenido/i.test(a.innerText) && a.getAttribute('href')?.startsWith('#')))`,
    );
    check('the page has a skip-to-content link for keyboard users', hasSkip);
    check('the page has a main landmark', await desktop.evaluate(`Boolean(document.querySelector('main'))`));
    check('the page has one h1', (await desktop.evaluate(`document.querySelectorAll('h1').length`)) === 1);

    // Every Tab stop of each page must show a ring. Real Tab presses are used because only they set :focus-visible.
    for (const path of [
      '/en/',
      '/en/shop',
      '/en/products/classic-tee',
      '/en/cart',
      '/en/checkout',
      '/en/contact',
    ]) {
      await desktop.goto(BASE + path, 2200);
      const bad = [];
      let stops = 0;
      const seen = new Set();
      for (let i = 0; i < 70; i += 1) {
        await press(desktop, 'Tab');
        const stop = JSON.parse(
          await desktop.evaluate(
            `(() => { const e = document.activeElement; if (!e || e === document.body) return JSON.stringify(null); const s = getComputedStyle(e); const name = (e.getAttribute('aria-label') || e.innerText || e.name || e.getAttribute('href') || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 28); return JSON.stringify({ name, key: e.tagName + name + Math.round(e.getBoundingClientRect().top), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0, shadow: s.boxShadow !== 'none' }); })()`,
          ),
        );
        if (!stop) break;
        if (seen.has(stop.key)) break;
        seen.add(stop.key);
        stops += 1;
        if (!stop.ring && !stop.shadow) bad.push(stop.name);
      }
      check(
        `${path}: all ${stops} Tab stops show a focus ring`,
        stops > 5 && bad.length === 0,
        `${bad.length} without: ${bad.slice(0, 5).join(' | ')}`,
      );
    }

    // Search overlay.
    await desktop.goto(`${BASE}/en/`, 2500);
    await desktop.evaluate(`document.querySelector('header button[aria-label="Search"]').focus()`);
    await press(desktop, 'Enter');
    await wait(400);
    check(
      'Enter on the search button opens the overlay',
      await desktop.evaluate(`Boolean(document.querySelector('[role=dialog] input, dialog[open] input'))`),
    );
    check('focus moves into the overlay', (await active(desktop)).endsWith('true'), await active(desktop));
    let escaped = true;
    for (let i = 0; i < 12; i += 1) {
      await press(desktop, 'Tab');
      const now = await active(desktop);
      // A native modal dialog cycles back through the browser's own UI, which shows as "body"; any page element is a leak.
      if (now !== 'body' && !now.endsWith('true')) escaped = false;
    }
    check('Tab cannot leave the open overlay', escaped, await active(desktop));
    await press(desktop, 'Escape');
    await wait(300);
    check(
      'Escape closes the overlay',
      !(await desktop.evaluate(`Boolean(document.querySelector('[role=dialog] input, dialog[open] input'))`)),
    );
    check(
      'focus returns to the Search button',
      (await active(desktop)).includes('Search'),
      await active(desktop),
    );

    // Cart drawer.
    await desktop.goto(`${BASE}/en/products/classic-tee?v=var-tee-m-black`, 2500);
    await desktop.evaluate(
      `[...document.querySelectorAll('main button')].find((b) => /add to cart/i.test(b.innerText)).focus()`,
    );
    await press(desktop, 'Enter');
    await wait(900);
    const drawerOpen = await desktop.evaluate(
      `Boolean(document.querySelector('[role=dialog], dialog[open]'))`,
    );
    check('adding to the cart from the keyboard opens the cart drawer', drawerOpen);
    if (drawerOpen) {
      check('focus moves into the drawer', (await active(desktop)).endsWith('true'), await active(desktop));
      let stays = true;
      for (let i = 0; i < 12; i += 1) {
        await press(desktop, 'Tab');
        const now = await active(desktop);
        if (now !== 'body' && !now.endsWith('true')) stays = false;
      }
      check('Tab cannot leave the open drawer', stays, await active(desktop));
      await press(desktop, 'Escape');
      await wait(300);
      check(
        'Escape closes the drawer',
        !(await desktop.evaluate(`Boolean(document.querySelector('[role=dialog], dialog[open]'))`)),
      );
    }

    // Cookie banner.
    await desktop.cdp('Network.clearBrowserCookies');
    await desktop.goto(`${BASE}/en/`, 3000);
    const banner = await desktop.evaluate(
      `[...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((t) => /accept|only necessary/i.test(t))`,
    );
    check('the cookie banner offers both choices as buttons', banner.length === 2, banner.join(' | '));
    await desktop.evaluate(
      `[...document.querySelectorAll('button')].find((b) => /^accept$/i.test(b.innerText.trim())).focus()`,
    );
    await press(desktop, 'Enter');
    await wait(600);
    check(
      'Accept works from the keyboard and sets the choice',
      /consent=v1\.m1/.test(await desktop.evaluate('document.cookie')),
    );
    check(
      'the banner is gone after the choice',
      !(await desktop.evaluate(
        `[...document.querySelectorAll('button')].some((b) => /^accept$/i.test(b.innerText.trim()))`,
      )),
    );
  } finally {
    desktop.close();
  }

  // ------------------------------------------------------------------------------------------------------------- phone
  const phone = await openBrowser({ port: 9471, width: 390, height: 844, scale: 2, mobile: true });
  try {
    await phone.goto(`${BASE}/en/shop`, 3000);
    const opener = await phone.evaluate(
      `(() => { const b = [...document.querySelectorAll('button, summary, a')].find((x) => /filter/i.test((x.innerText || x.getAttribute('aria-label') || '')) && x.getBoundingClientRect().width > 0); if (!b) return null; b.setAttribute('data-test-opener', '1'); return b.tagName + '|' + (b.innerText || b.getAttribute('aria-label')).trim().slice(0, 30); })()`,
    );
    check('the shop has a visible "Filters" control on a phone', Boolean(opener), String(opener));
    if (opener) {
      await phone.evaluate(`document.querySelector('[data-test-opener]').focus()`);
      await press(phone, 'Enter');
      await wait(700);
      const open = await phone.evaluate(
        `Boolean(document.querySelector('[role=dialog], dialog[open], details[open] form, aside[data-open], [data-filters-open]')) || [...document.querySelectorAll('form[aria-label]')].some((f) => f.getBoundingClientRect().height > 100 && f.getBoundingClientRect().width > 100 && getComputedStyle(f).visibility !== 'hidden')`,
      );
      check('the filters open from the keyboard on a phone', open);
      await press(phone, 'Escape');
      await wait(500);
      const stillOpen = await phone.evaluate(
        `Boolean(document.querySelector('[role=dialog][open], dialog[open], details[open] form'))`,
      );
      check('Escape closes the filter drawer', !stillOpen);
    }
  } finally {
    phone.close();
  }
} finally {
  await post('/api/admin/settings/marketing', { values: original }, cookie);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = failures.length ? 1 : 0;
