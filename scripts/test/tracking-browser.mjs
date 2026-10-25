// Browser half of the tracking test (see tracking.mjs): one visitor accepts marketing and one refuses, and each walks the store the way a
// shopper does: the home page, a product, add to cart, the checkout, and the page of an unpaid and a paid order. For the visitor who
// accepted, GA4 and the Pixel must receive page_view, view_item, add_to_cart, begin_checkout and purchase with the right facts; for the
// one who refused, nothing at all. Chrome refuses every request to Google and Meta, so nothing leaves this machine, and the page's own
// queues (`dataLayer`, `fbq.queue`) show what the tools were given. The script policy of the build is watched the whole time.
import { openBrowser, wait } from '../docs/chrome.mjs';
import { BASE, sql } from '../docs/shared.mjs';

/** Hosts of the two tools. Chrome refuses them, and every attempt is recorded before it is refused. */
const BLOCKED = [
  '*://*.googletagmanager.com/*',
  '*://*.google-analytics.com/*',
  '*://*.facebook.net/*',
  '*://*.facebook.com/*',
];
const THIRD_PARTY = /googletagmanager|google-analytics|facebook\.(com|net)|fbcdn/;

/** Installed before any page script: collects every script-policy violation of the page. */
const WATCH_POLICY = `window.__csp = [];
document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.blockedURI + ' ' + e.violatedDirective));`;

/** What the page has given the tools so far, and what the policy has refused. */
const SNAPSHOT = `JSON.stringify({
  dataLayer: Array.isArray(window.dataLayer) ? window.dataLayer.map((entry) => Array.from(entry)) : null,
  fbq: window.fbq ? window.fbq.queue.map((entry) => Array.from(entry)) : null,
  sent: Object.keys(localStorage).filter((key) => key.startsWith('purchase-sent:')),
  csp: window.__csp ?? [],
})`;

/** GA4 events as [name, parameters]. */
const gaEvents = (state) =>
  (state.dataLayer ?? []).filter((entry) => entry[0] === 'event').map((entry) => [entry[1], entry[2] ?? {}]);
/** Pixel standard events as [name, parameters, options]. */
const pixelEvents = (state) =>
  (state.fbq ?? [])
    .filter((entry) => entry[0] === 'track')
    .map((entry) => [entry[1], entry[2] ?? {}, entry[3] ?? {}]);
const only = (events, name) => events.filter(([event]) => event === name);

/**
 * Runs both visitors.
 * @param ctx check(name, ok, detail); place(cookies) and pay(order), the order helpers of tracking.mjs.
 */
export async function runBrowserFlows({ check, place, pay }) {
  const slug = sql(
    "SELECT slug FROM product_translations WHERE product_id = 'prod-bottle' AND locale = 'en'",
  )[0]?.slug;
  if (!slug) throw new Error('The seed product prod-bottle has no English slug');

  for (const choice of ['accept', 'reject']) {
    const accept = choice === 'accept';
    const label = `[${choice}]`;
    const browser = await openBrowser({
      port: 9460 + (accept ? 1 : 0),
      width: 390,
      height: 844,
      mobile: true,
    });
    try {
      const attempts = [];
      browser.onEvent((message) => {
        if (message.method === 'Network.requestWillBeSent') attempts.push(message.params.request.url);
      });
      await browser.cdp('Network.setBlockedURLs', { urls: BLOCKED });
      await browser.cdp('Page.addScriptToEvaluateOnNewDocument', { source: WATCH_POLICY });
      const state = async () => JSON.parse(await browser.evaluate(SNAPSHOT));
      const thirdParty = () => attempts.filter((url) => THIRD_PARTY.test(url));
      /** The two checks every step of the visitor who refused shares: nothing queued, nothing requested. */
      const silent = async (step) => {
        const now = await state();
        check(
          `${label} ${step}: nothing was given to GA4 or the Pixel, and nothing was requested`,
          now.dataLayer === null && now.fbq === null && thirdParty().length === 0,
          JSON.stringify({ dataLayer: now.dataLayer, fbq: now.fbq, requests: thirdParty() }),
        );
      };

      // 1. Home page, then the choice.
      await browser.goto(`${BASE}/en/`, 3500);
      const wanted = accept ? /accept|aceptar/i : /only necessary|necesari/i;
      await browser.evaluate(
        `(() => { [...document.querySelectorAll('button')].find((x) => ${wanted}.test(x.innerText))?.click(); })()`,
      );
      await wait(2500);
      if (!accept) await silent('home page');
      else {
        const now = await state();
        check(
          `${label} home page: one page_view to GA4 and one PageView to the Pixel`,
          only(gaEvents(now), 'page_view').length === 1 && only(pixelEvents(now), 'PageView').length === 1,
          JSON.stringify({ ga: gaEvents(now), pixel: pixelEvents(now) }),
        );
      }

      // 2. Product page: view_item.
      await browser.goto(`${BASE}/en/products/${slug}`, 4500);
      let now = await state();
      let variant = null;
      if (!accept) await silent('product page');
      else {
        const view = only(gaEvents(now), 'view_item');
        variant = view[0]?.[1]?.items?.[0]?.item_id ?? null;
        check(
          `${label} product page: one view_item with the variant and the currency`,
          view.length === 1 && typeof variant === 'string' && Boolean(view[0][1].currency),
          JSON.stringify(view),
        );
        const pixel = only(pixelEvents(now), 'ViewContent');
        check(
          `${label} product page: one ViewContent with the same variant and an event id`,
          pixel.length === 1 && pixel[0][1].content_ids?.[0] === variant && Boolean(pixel[0][2].eventID),
          JSON.stringify(pixel),
        );
      }

      // 3. Add to cart.
      const added = await browser.evaluate(
        `(() => { const b = [...document.querySelectorAll('button')].find((x) => /^add to cart/i.test(x.innerText.trim())); if (!b) return false; b.click(); return true; })()`,
      );
      check(`${label} the product page has an Add to cart button`, added === true, String(added));
      await wait(1500);
      now = await state();
      if (!accept) await silent('add to cart');
      else {
        const add = only(gaEvents(now), 'add_to_cart');
        check(
          `${label} add to cart: one add_to_cart for that variant with a value`,
          add.length === 1 && add[0][1].items?.[0]?.item_id === variant && add[0][1].value > 0,
          JSON.stringify(add),
        );
        check(
          `${label} add to cart: one AddToCart to the Pixel`,
          only(pixelEvents(now), 'AddToCart').length === 1,
          JSON.stringify(pixelEvents(now)),
        );
      }

      // 4. Checkout: begin_checkout once, with the cart.
      await browser.goto(`${BASE}/en/checkout`, 5000);
      now = await state();
      if (!accept) await silent('checkout');
      else {
        const begin = only(gaEvents(now), 'begin_checkout');
        check(
          `${label} checkout: exactly one begin_checkout with the cart's variant and a value`,
          begin.length === 1 && begin[0][1].items?.[0]?.item_id === variant && begin[0][1].value > 0,
          JSON.stringify(begin),
        );
        check(
          `${label} checkout: one InitiateCheckout to the Pixel`,
          only(pixelEvents(now), 'InitiateCheckout').length === 1,
          JSON.stringify(pixelEvents(now)),
        );
      }

      // 5. An unpaid order page reports nothing; a paid one reports the purchase once.
      const unpaid = await place('');
      await browser.goto(`${BASE}${unpaid.path}`, 4500);
      now = await state();
      check(
        `${label} unpaid order page: no purchase`,
        only(gaEvents(now), 'purchase').length === 0 &&
          only(pixelEvents(now), 'Purchase').length === 0 &&
          now.sent.length === 0,
        JSON.stringify(now),
      );

      const paid = await place('');
      await pay(paid.number);
      await browser.goto(`${BASE}${paid.path}`, 4500);
      now = await state();
      if (!accept) {
        check(
          `${label} paid order page: no purchase, and no "already sent" mark`,
          now.dataLayer === null && now.fbq === null && now.sent.length === 0,
          JSON.stringify(now),
        );
      } else {
        const purchase = only(gaEvents(now), 'purchase');
        const p = purchase[0]?.[1] ?? {};
        check(
          `${label} paid order page: one purchase to GA4 with the order id, value and items`,
          purchase.length === 1 &&
            p.transaction_id === paid.id &&
            p.value === paid.total / 100 &&
            Boolean(p.currency) &&
            p.items?.length > 0,
          JSON.stringify(purchase),
        );
        const pixel = only(pixelEvents(now), 'Purchase');
        check(
          `${label} paid order page: one Purchase to the Pixel with the id the server uses`,
          pixel.length === 1 &&
            pixel[0][2].eventID === `purchase-${paid.id}` &&
            pixel[0][1].value === paid.total / 100,
          JSON.stringify(pixel),
        );
        check(
          `${label} paid order page: the browser remembers it sent this order`,
          now.sent.length === 1,
          JSON.stringify(now.sent),
        );
        await browser.goto(`${BASE}${paid.path}`, 4500);
        now = await state();
        check(
          `${label} the same order page again: no second purchase`,
          only(gaEvents(now), 'purchase').length === 0 && only(pixelEvents(now), 'Purchase').length === 0,
          JSON.stringify({ ga: gaEvents(now), pixel: pixelEvents(now) }),
        );
      }

      // The policy: nothing the app loaded was refused by it; and it is active (a script from any other host is refused).
      now = await state();
      check(
        `${label} the script policy refused nothing the page needs`,
        now.csp.length === 0,
        JSON.stringify(now.csp),
      );
      if (accept) {
        await browser.evaluate(
          `(() => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/preact@10.0.0/dist/preact.min.js'; document.head.appendChild(s); })()`,
        );
        await wait(800);
        const control = (await state()).csp;
        check(
          `${label} control: a script from a host that is not allowed is refused`,
          control.length === 1 && /jsdelivr/.test(control[0]),
          JSON.stringify(control),
        );
        check(
          `${label} the browser requested gtag.js for the store's id and the Pixel script`,
          thirdParty().some((url) => /googletagmanager\.com\/gtag\/js\?id=G-TESTTRACK1/.test(url)) &&
            thirdParty().some((url) => /connect\.facebook\.net/.test(url)),
          thirdParty().join(' | '),
        );
      } else {
        check(
          `${label} the browser never tried to reach Google or Meta`,
          thirdParty().length === 0,
          thirdParty().join(' | '),
        );
      }
    } finally {
      browser.close();
    }
  }
}
