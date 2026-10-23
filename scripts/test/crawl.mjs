// Crawls the LOCAL demo store like a visitor and like the owner: it follows every internal link, image, stylesheet, script and
// alternate-language link it finds, and reports what is broken or sloppy. The storefront is crawled without a session, the admin
// with the owner's session. Only GET requests are made, and the admin's sign-out is never followed.
//
// Checks per page: status, a title, one h1, a meta description (public pages), images with an alt attribute, unique ids, links with a
// real target, new-tab links with rel="noopener", canonical and hreflang pointing at pages that exist, and every asset answering 200.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:crawl
import { readFileSync } from 'node:fs';
import { BASE } from '../docs/shared.mjs';

const owner = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
const MAX_PAGES = Number(process.env.CRAWL_MAX ?? 900);
/** Paths a crawler must not request: they change state or end the session. */
const SKIP = [/^\/admin\/logout/, /^\/api\/admin\/logout/, /^\/cdn-cgi\//];
/** Query parameters that only reorder or filter a list: one visit per parameter-less page is enough after the first few. */
const FILTER_QUERY_LIMIT = 40;

const problems = [];
const seen = new Map(); // url -> { status, type }
const queue = [];
let filterVisits = 0;

/**
 * Notes a problem, once per page and message.
 * @param page Page the problem was found on.
 * @param message What is wrong.
 */
function problem(page, message) {
  const key = `${page} ${message}`;
  if (!problems.some((p) => p.key === key)) problems.push({ key, page, message });
}

/**
 * The absolute same-origin URL of a link, without its fragment, or null for an external or unusable link.
 * @param href Raw attribute value.
 * @param from The page that holds it.
 * @returns A normalised URL string, or null.
 */
function resolve(href, from) {
  if (!href || /^(mailto:|tel:|javascript:|data:|blob:)/i.test(href.trim())) return null;
  let url;
  try {
    url = new URL(href.trim(), from);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  url.hash = '';
  return url.toString();
}

/**
 * Adds a URL to the queue when it is new and allowed.
 * @param url Absolute URL.
 * @param from The page that links to it.
 * @param admin Whether the owner's session is sent.
 */
function enqueue(url, from, admin) {
  const path = new URL(url).pathname;
  if (SKIP.some((rule) => rule.test(path)) || seen.has(url) || queue.some((q) => q.url === url)) return;
  if (new URL(url).search && filterVisits >= FILTER_QUERY_LIMIT && !/[?&](v|key|page)=/.test(url)) return;
  if (new URL(url).search && !/[?&](v|key)=/.test(url)) filterVisits += 1;
  queue.push({ url, from, admin });
}

/**
 * Reads the attributes of every tag of one kind.
 * @param html Page source.
 * @param tag Tag name.
 * @returns One attribute map per tag.
 */
function tags(html, tag) {
  return [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((a) => [
        a[1].toLowerCase(),
        a[2] ?? a[3] ?? a[4] ?? '',
      ]),
    ),
  );
}

/**
 * Checks one HTML page and queues what it links to.
 * @param url Page URL.
 * @param html Page source.
 * @param admin Whether this is a page of the admin.
 */
function inspect(url, html, admin) {
  const path = new URL(url).pathname + new URL(url).search;
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
  if (!title) problem(path, 'no <title>');
  const h1s = (html.match(/<h1\b/gi) ?? []).length;
  if (h1s !== 1 && !/\/(404|500)$/.test(path)) problem(path, `${h1s} h1 elements (expected 1)`);
  if (!admin && !/noindex/i.test(html) && !/<meta[^>]+name="description"[^>]+content="[^"]+"/i.test(html))
    problem(path, 'no meta description');

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) problem(path, `duplicate id "${dup}"`);

  for (const img of tags(html, 'img')) {
    if (!('alt' in img)) problem(path, `image without alt: ${(img.src ?? '').slice(0, 60)}`);
    for (const ref of [
      img.src,
      ...(img.srcset ?? '').split(',').map((part) => part.trim().split(/\s+/)[0]),
    ]) {
      const target = resolve(ref, url);
      if (target) enqueue(target, path, admin);
    }
  }
  for (const a of tags(html, 'a')) {
    if (a.href === undefined) continue;
    if (a.href === '' || a.href === '#') problem(path, 'link with an empty target');
    if (a.target === '_blank' && !/noopener/.test(a.rel ?? ''))
      problem(path, `target=_blank without rel=noopener: ${a.href.slice(0, 50)}`);
    const target = resolve(a.href, url);
    if (target) enqueue(target, path, admin);
  }
  for (const link of tags(html, 'link')) {
    const target = resolve(link.href, url);
    if (target && /stylesheet|icon|preload|alternate|canonical|manifest/.test(link.rel ?? ''))
      enqueue(target, path, admin);
  }
  for (const script of tags(html, 'script')) {
    const target = resolve(script.src, url);
    if (target) enqueue(target, path, admin);
  }
  for (const form of tags(html, 'form')) {
    if (form.action && form.method?.toLowerCase() !== 'post') {
      const target = resolve(form.action, url);
      if (target) enqueue(target, path, admin);
    }
  }
  // Public pages: canonical and every hreflang alternate must be real pages.
  if (!admin && !/noindex/i.test(html)) {
    const canonical = tags(html, 'link').find((l) => l.rel === 'canonical');
    if (!canonical && !/\/(404|500)$/.test(path)) problem(path, 'no canonical link');
    const alternates = tags(html, 'link').filter((l) => l.rel === 'alternate' && l.hreflang);
    if (alternates.length < 2) problem(path, 'fewer than two hreflang alternates');
  }
}

console.log(`crawling ${BASE} (limit ${MAX_PAGES} URLs)`);
for (const start of ['/en/', '/es/', '/sitemap.xml', '/robots.txt', '/feeds/products.xml?locale=en'])
  enqueue(new URL(start, BASE).toString(), 'start', false);
enqueue(new URL('/admin', BASE).toString(), 'start', true);

let done = 0;
while (queue.length > 0 && done < MAX_PAGES) {
  const { url, from, admin } = queue.shift();
  let response;
  try {
    response = await fetch(url, { headers: admin ? { cookie: owner } : {}, redirect: 'manual' });
  } catch (error) {
    problem(from, `request failed: ${url} (${String(error.cause?.code ?? error.message)})`);
    seen.set(url, { status: 0 });
    continue;
  }
  const type = response.headers.get('content-type') ?? '';
  seen.set(url, { status: response.status, type });
  done += 1;
  const path = new URL(url).pathname + new URL(url).search;
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    const target = location ? resolve(location, url) : null;
    // A redirect that leaves the crawl (login, language) is followed once; a redirect to a page that does not exist is a defect.
    if (target) enqueue(target, path, admin);
    continue;
  }
  if (response.status >= 400) {
    const expected404 = /\/(no-such|404)/.test(path);
    if (!expected404) problem(from, `${response.status} ${path}`);
    continue;
  }
  if (type.includes('text/html')) inspect(url, await response.text(), admin);
  else await response.arrayBuffer();
}

const pages = [...seen.entries()].filter(([, v]) => v.type?.includes('text/html')).length;
const broken = [...seen.entries()].filter(([, v]) => v.status >= 400 || v.status === 0).length;
console.log(
  `\n${seen.size} URLs fetched (${pages} HTML pages), ${broken} answered with an error, ${queue.length} left unvisited`,
);
console.log(problems.length === 0 ? 'No problems found.' : `\n${problems.length} problems:`);
for (const { page, message } of problems.slice(0, 120)) console.log(`  ${page}  ->  ${message}`);
if (problems.length > 120) console.log(`  ... and ${problems.length - 120} more`);
process.exitCode = problems.length === 0 ? 0 : 1;
