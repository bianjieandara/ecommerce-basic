// Filter test of the LOCAL demo store's catalog. It reads an independent snapshot of the catalog from the database, works out what every
// filter combination must show (the products, their order, the page contents and the facet counts), and compares that with the real
// pages in both languages and in each "out-of-stock products" mode. It also checks the live count API, canonical URLs and indexing.
// Settings it changes for the run (page size, out-of-stock mode) and the data it edits (a draft product) are restored at the end.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:filters
import { readFileSync } from 'node:fs';
import { BASE, post, sql } from '../docs/shared.mjs';

const cookie = readFileSync('.wrangler/docs-cookie.txt', 'utf8');
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
  if (!ok) failures.push(`${name}${detail ? '  -> ' + detail : ''}`);
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------------------------------- snapshot of the data
const rows = (query) => sql(query);
const snapshot = {
  products: rows(
    'SELECT id, status, min_price_minor AS price, is_on_sale AS sale, is_featured AS featured, created_at AS created, sales_count AS sales FROM products',
  ),
  text: rows(
    'SELECT product_id AS id, locale, name, slug, short_description AS short FROM product_translations',
  ),
  categories: rows(
    'SELECT pc.product_id AS id, ct.locale, ct.slug FROM product_categories pc JOIN category_translations ct ON ct.category_id = pc.category_id',
  ),
  categoryList: rows(
    'SELECT c.id, ct.locale, ct.slug FROM categories c JOIN category_translations ct ON ct.category_id = c.id',
  ),
  variants: rows(
    'SELECT id, product_id AS pid, is_active AS active, track_inventory AS tracked, stock FROM product_variants',
  ),
  values: rows(
    'SELECT vav.variant_id AS vid, vav.attribute_value_id AS value, av.attribute_id AS attr FROM variant_attribute_values vav JOIN attribute_values av ON av.id = vav.attribute_value_id',
  ),
  attributes: rows('SELECT id FROM attributes WHERE is_filterable = 1').map((r) => r.id),
  valueAttr: Object.fromEntries(
    rows('SELECT id, attribute_id AS attr FROM attribute_values').map((r) => [r.id, r.attr]),
  ),
};
const catalogRow = rows("SELECT value_json FROM settings WHERE group_key = 'catalog'")[0];
const originalCatalog = JSON.parse(catalogRow.value_json);
let settings = { ...originalCatalog };
const PAGE_SIZE = 6;

// ------------------------------------------------------------------------------------------------------ expected results
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s) =>
  norm(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const inStock = (id) =>
  snapshot.variants.some((v) => v.pid === id && v.active === 1 && (v.tracked === 0 || v.stock > 0));

/**
 * The products a filter state must show, before paging.
 * @param locale Page language.
 * @param f Filters: q, category, v (array), min, max (minor units), stock, sale, isNew, sort.
 * @param skip Filters a facet leaves out when it counts its own values.
 * @returns Product records in display order.
 */
function expected(locale, f, skip = []) {
  const cutoff = Date.now() - settings.newDays * 86400000;
  let list = snapshot.products
    .filter((p) => p.status === 'active')
    .map((p) => ({ ...p, ...snapshot.text.find((t) => t.id === p.id && t.locale === locale) }))
    .filter((p) => p.slug !== undefined);
  if (settings.showOutOfStock === 'hide') list = list.filter((p) => inStock(p.id));
  if (f.q && !skip.includes('q')) {
    const tokens = words(f.q);
    list =
      tokens.length === 0
        ? []
        : list.filter((p) => {
            const w = words(`${p.name} ${p.short ?? ''}`);
            return tokens.every((t) => w.some((x) => x.startsWith(t)));
          });
  }
  if (f.category && !skip.includes('category'))
    list = list.filter((p) =>
      snapshot.categories.some((c) => c.id === p.id && c.locale === locale && c.slug === f.category),
    );
  const groups = new Map();
  for (const value of f.v ?? []) {
    const attr = snapshot.valueAttr[value];
    if (!attr) {
      list = [];
      continue;
    }
    groups.set(attr, [...(groups.get(attr) ?? []), value]);
  }
  for (const [attr, values] of groups) {
    if (skip.includes(`attr:${attr}`)) continue;
    list = list.filter((p) =>
      snapshot.variants.some(
        (v) => v.pid === p.id && snapshot.values.some((x) => x.vid === v.id && values.includes(x.value)),
      ),
    );
  }
  // A range typed backwards (min above max) is read the other way round, as the store's parser does.
  const [low, high] = f.min != null && f.max != null && f.min > f.max ? [f.max, f.min] : [f.min, f.max];
  if (low != null && !skip.includes('price')) list = list.filter((p) => p.price >= low);
  if (high != null && !skip.includes('price')) list = list.filter((p) => p.price <= high);
  if (f.stock && !skip.includes('stock')) list = list.filter((p) => inStock(p.id));
  if (f.sale && !skip.includes('sale')) list = list.filter((p) => p.sale === 1);
  if (f.isNew && !skip.includes('new')) list = list.filter((p) => Date.parse(p.created) >= cutoff);
  const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sorters = {
    price_asc: (a, b) => a.price - b.price || byId(a, b),
    price_desc: (a, b) => b.price - a.price || byId(a, b),
    best_sellers: (a, b) => b.sales - a.sales || byId(a, b),
    featured: (a, b) =>
      b.featured - a.featured || (a.created < b.created ? 1 : a.created > b.created ? -1 : 0) || byId(a, b),
    newest: (a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0) || byId(a, b),
  };
  const sort = f.sort === 'relevance' || !f.sort ? settings.defaultSort : f.sort;
  list = [...list].sort(sorters[sort]);
  if (settings.showOutOfStock === 'last')
    list = [...list.filter((p) => inStock(p.id)), ...list.filter((p) => !inStock(p.id))];
  return list;
}

/**
 * The facet counts a filter state must show.
 * @param locale Page language.
 * @param f Filters.
 * @returns Category counts by slug, value counts by id, and the three flag counts.
 */
function expectedFacets(locale, f) {
  const cutoff = Date.now() - settings.newDays * 86400000;
  const categories = {};
  const slugs = new Set(snapshot.categories.filter((c) => c.locale === locale).map((c) => c.slug));
  for (const slug of slugs) {
    const n = expected(locale, { ...f, category: null }, []).filter((p) =>
      snapshot.categories.some((c) => c.id === p.id && c.locale === locale && c.slug === slug),
    ).length;
    if (n > 0) categories[slug] = n;
  }
  const values = {};
  for (const attr of snapshot.attributes) {
    const pool = expected(locale, f, [`attr:${attr}`]);
    for (const value of Object.keys(snapshot.valueAttr).filter((id) => snapshot.valueAttr[id] === attr)) {
      values[value] = pool.filter((p) =>
        snapshot.variants.some(
          (v) => v.pid === p.id && snapshot.values.some((x) => x.vid === v.id && x.value === value),
        ),
      ).length;
    }
  }
  const flagPool = expected(locale, f, ['stock', 'sale', 'new']);
  return {
    categories,
    values,
    flags: {
      stock: flagPool.filter((p) => inStock(p.id)).length,
      sale: flagPool.filter((p) => p.sale === 1).length,
      new: flagPool.filter((p) => Date.parse(p.created) >= cutoff).length,
    },
  };
}

// ----------------------------------------------------------------------------------------------------- the real pages
/**
 * URL parameters of a filter state, as a visitor's browser would send them.
 * @param f Filters.
 * @param page Page number.
 * @param raw Prices as typed (strings), when they differ from minor units.
 * @returns A query string without the leading "?".
 */
function queryOf(f, page = 1, raw = {}) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  for (const v of f.v ?? []) p.append('v', v);
  const minor = (n) => (n / 100).toFixed(2).replace(/\.00$/, '');
  if (f.min != null) p.set('min', raw.min ?? minor(f.min));
  if (f.max != null) p.set('max', raw.max ?? minor(f.max));
  if (f.stock) p.set('stock', '1');
  if (f.sale) p.set('sale', '1');
  if (f.isNew) p.set('new', '1');
  if (f.sort) p.set('sort', f.sort);
  if (page > 1) p.set('page', String(page));
  return p.toString();
}

/**
 * Reads one catalog page: the products in order, the total, and the facet counts.
 * @param locale Page language.
 * @param f Filters.
 * @param page Page number.
 * @param raw Prices as typed.
 * @returns What the page shows.
 */
async function readPage(locale, f, page = 1, raw = {}) {
  const path = `/${locale}/shop${f.category ? '/' + f.category : ''}`;
  const query = queryOf(f, page, raw);
  // The visitor's browser follows a redirect to the canonical URL (sorted values, default sort left out), so the test does too.
  const response = await fetch(`${BASE}${path}${query ? '?' + query : ''}`, { redirect: 'follow' });
  const html = response.status === 200 ? await response.text() : '';
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  const slugs = [];
  for (const m of main.matchAll(new RegExp(`href="/${locale}/products/([^"?#]+)`, 'g')))
    if (!slugs.includes(m[1])) slugs.push(m[1]);
  const total = Number(new RegExp('(\\d+)\\s+(?:products?|productos?)').exec(main)?.[1] ?? NaN);
  const categories = {};
  for (const m of main.matchAll(
    new RegExp(
      `<a href="/${locale}/shop/([a-z0-9-]+)[^"]*"[^>]*>\\s*<span>[^<]*</span>\\s*<span[^>]*>\\((\\d+)\\)</span>`,
      'g',
    ),
  ))
    categories[m[1]] ??= Number(m[2]);
  const values = {};
  for (const m of main.matchAll(
    /<input[^>]*name="v" value="([^"]+)"[^>]*>\s*(?:<span[^>]*aria-hidden[^>]*><\/span>\s*)?<span>[^<]*<\/span>\s*<span[^>]*>\((\d+)\)<\/span>/g,
  ))
    values[m[1]] ??= Number(m[2]);
  const flag = (name) => {
    const m = new RegExp(
      `name="${name}" value="1"[^>]*>\\s*<span>[^<]*</span>\\s*<span[^>]*>\\((\\d+)\\)`,
    ).exec(main);
    return m ? Number(m[1]) : null;
  };
  return {
    status: response.status,
    location: response.headers.get('location'),
    slugs,
    total,
    categories,
    values,
    flags: { stock: flag('stock'), sale: flag('sale'), new: flag('new') },
    html,
  };
}

/**
 * Compares one filter state with the expectation: total, every page in order, facets.
 * @param label Test name.
 * @param locale Page language.
 * @param f Filters.
 * @param withFacets Whether to compare facet counts too.
 */
async function compare(label, locale, f, withFacets = true) {
  const want = expected(locale, f);
  const wantSlugs = want.map((p) => p.slug);
  const pages = Math.max(1, Math.ceil(want.length / PAGE_SIZE));
  const got = [];
  let first = null;
  for (let page = 1; page <= pages; page += 1) {
    const read = await readPage(locale, f, page);
    first ??= read;
    if (read.status !== 200) {
      check(`${label}: page ${page} answers 200`, false, String(read.status));
      return;
    }
    check(
      `${label}: page ${page} has the right products`,
      JSON.stringify(read.slugs) ===
        JSON.stringify(wantSlugs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)),
      `want ${wantSlugs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).join(',')} got ${read.slugs.join(',')}`,
    );
    got.push(...read.slugs);
  }
  check(
    `${label}: total`,
    want.length === 0 ? first.total === 0 || Number.isNaN(first.total) : first.total === want.length,
    `want ${want.length} got ${first.total}`,
  );
  check(`${label}: no product repeats across pages`, new Set(got).size === got.length, got.join(','));
  if (withFacets) {
    const facets = expectedFacets(locale, f);
    const sameCounts = (a, b) =>
      Object.keys(a)
        .filter((k) => a[k] > 0)
        .every((k) => b[k] === a[k]) && Object.keys(b).every((k) => (a[k] ?? 0) === b[k]);
    // Inside a category the panel has no category list: the path already says which one.
    check(
      `${label}: category counts`,
      f.category
        ? Object.keys(first.categories).length === 0
        : sameCounts(facets.categories, first.categories),
      `want ${JSON.stringify(facets.categories)} got ${JSON.stringify(first.categories)}`,
    );
    check(
      `${label}: attribute value counts`,
      sameCounts(facets.values, first.values),
      `want ${JSON.stringify(facets.values)} got ${JSON.stringify(first.values)}`,
    );
    check(
      `${label}: flag counts`,
      first.flags.stock === facets.flags.stock &&
        first.flags.sale === facets.flags.sale &&
        first.flags.new === facets.flags.new,
      `want ${JSON.stringify(facets.flags)} got ${JSON.stringify(first.flags)}`,
    );
  }
}

/** Applies catalog settings for the next checks and bumps the page cache. */
async function useSettings(change) {
  settings = { ...originalCatalog, pageSize: PAGE_SIZE, ...change };
  const saved = await post('/api/admin/settings/catalog', { values: settings }, cookie);
  if (saved.status !== 200) throw new Error(`could not save catalog settings: ${JSON.stringify(saved.json)}`);
  await wait(300);
}

// ------------------------------------------------------------------------------------------------------------- scenarios
const firstCategory = (locale) => snapshot.categoryList.find((c) => c.locale === locale)?.slug;
const categoriesOf = (locale) => [
  ...new Set(snapshot.categoryList.filter((c) => c.locale === locale).map((c) => c.slug)),
];
const allValues = Object.keys(snapshot.valueAttr);
const byAttr = (a) => allValues.filter((v) => snapshot.valueAttr[v] === a);
const SORTS = ['featured', 'newest', 'price_asc', 'price_desc', 'best_sellers'];
const sampleName = (locale) => snapshot.text.find((t) => t.locale === locale)?.name ?? 'a';

/** Seeded pseudo-random numbers, so a failing combination can be reproduced. */
let seed = 20261023;
const random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(random() * list.length)];

/**
 * One random filter state.
 * @param locale Page language.
 * @returns Filters.
 */
function randomState(locale) {
  const f = {};
  if (random() < 0.3) f.category = pick(categoriesOf(locale));
  if (random() < 0.5) f.v = [...new Set([pick(allValues), ...(random() < 0.4 ? [pick(allValues)] : [])])];
  const prices = snapshot.products.map((p) => p.price).filter((n) => n != null);
  if (random() < 0.4) f.min = pick(prices);
  if (random() < 0.3) f.max = pick(prices) + (random() < 0.5 ? 0 : 100);
  if (f.min != null && f.max != null && f.min > f.max) [f.min, f.max] = [f.max, f.min];
  if (random() < 0.3) f.stock = true;
  if (random() < 0.3) f.sale = true;
  if (random() < 0.3) f.isNew = true;
  if (random() < 0.2) f.q = pick(words(sampleName(locale)).concat(['zzzz', 'a', 'the']));
  f.sort = pick(SORTS);
  return f;
}

console.log(
  `${snapshot.products.length} products, ${snapshot.variants.length} variants, ${allValues.length} attribute values in the snapshot`,
);
let draftId = null;
try {
  for (const mode of ['normal', 'last', 'hide']) {
    await useSettings({ showOutOfStock: mode });
    console.log(`mode: out-of-stock products ${mode}`);
    for (const locale of ['en', 'es']) {
      const tag = `[${mode}/${locale}]`;
      for (const sort of SORTS) await compare(`${tag} sort ${sort}`, locale, { sort });
      await compare(`${tag} no filters, default sort`, locale, {});
      for (const slug of categoriesOf(locale))
        await compare(`${tag} category ${slug}`, locale, { category: slug });
      for (const value of allValues) await compare(`${tag} value ${value}`, locale, { v: [value] });
      for (const attr of snapshot.attributes)
        if (byAttr(attr).length > 1)
          await compare(`${tag} two values of one attribute (OR)`, locale, { v: byAttr(attr).slice(0, 2) });
      if (snapshot.attributes.length > 1)
        await compare(`${tag} values of two attributes (AND)`, locale, {
          v: [byAttr(snapshot.attributes[0])[0], byAttr(snapshot.attributes[1])[0]],
        });
      await compare(`${tag} unknown value`, locale, { v: ['val-does-not-exist'] });
      await compare(`${tag} in stock only`, locale, { stock: true });
      await compare(`${tag} on sale`, locale, { sale: true });
      await compare(`${tag} new`, locale, { isNew: true });
      await compare(`${tag} price min`, locale, { min: 1500 });
      await compare(`${tag} price max`, locale, { max: 2000 });
      await compare(`${tag} price range`, locale, { min: 1000, max: 2500 });
      await compare(`${tag} price swapped`, locale, { min: 2500, max: 1000 });
      await compare(`${tag} price range with nothing`, locale, { min: 999000 });
      for (const q of words(sampleName(locale)).slice(0, 1).concat(['zzzz', 'a']))
        await compare(`${tag} search "${q}"`, locale, { q });
      await compare(`${tag} search with an accent`, locale, { q: sampleName(locale).toUpperCase() });
      await compare(`${tag} two search words`, locale, { q: sampleName(locale) });
      await compare(`${tag} sort price asc inside a category`, locale, {
        category: firstCategory(locale),
        sort: 'price_asc',
      });
      if (mode !== 'last')
        for (let i = 0; i < 12; i += 1) {
          const f = randomState(locale);
          await compare(`${tag} random ${i} ${queryOf(f)}`, locale, f);
        }
    }
  }

  // A draft product must disappear from every listing, count, facet and suggestion.
  await useSettings({ showOutOfStock: 'normal' });
  draftId = snapshot.products.find((p) => p.status === 'active')?.id;
  const draftSlug = snapshot.text.find((t) => t.id === draftId && t.locale === 'en').slug;
  sql(`UPDATE products SET status = 'draft' WHERE id = '${draftId}'`);
  snapshot.products.find((p) => p.id === draftId).status = 'draft';
  await useSettings({ showOutOfStock: 'normal' });
  await compare('[draft] the draft product is gone from /shop', 'en', {});
  check('[draft] its page answers 404', (await fetch(`${BASE}/en/products/${draftSlug}`)).status === 404);
  const suggest = await (
    await fetch(
      `${BASE}/api/search/suggest?q=${encodeURIComponent(words(snapshot.text.find((t) => t.id === draftId && t.locale === 'en').name)[0])}&locale=en`,
    )
  ).text();
  check('[draft] it is not suggested in search', !suggest.includes(draftSlug), suggest.slice(0, 120));
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  check('[draft] it is not in the sitemap', !sitemap.includes(`/products/${draftSlug}`));
  const feed = await (await fetch(`${BASE}/feeds/products.xml?locale=en`)).text();
  check('[draft] it is not in the product feed', !feed.includes(`/products/${draftSlug}`));
  sql(`UPDATE products SET status = 'active' WHERE id = '${draftId}'`);
  snapshot.products.find((p) => p.id === draftId).status = 'active';
  draftId = null;

  // The live count behind the filter button must equal the list the visitor gets.
  await useSettings({ showOutOfStock: 'hide' });
  for (let i = 0; i < 30; i += 1) {
    const locale = i % 2 === 0 ? 'en' : 'es';
    const f = randomState(locale);
    delete f.category;
    const response = await fetch(`${BASE}/api/catalog/count?locale=${locale}&${queryOf(f)}`);
    const json = await response.json().catch(() => null);
    check(
      `[count api] ${queryOf(f)}`,
      response.status === 200 && json?.data?.count === expected(locale, f).length,
      `want ${expected(locale, f).length} got ${JSON.stringify(json)?.slice(0, 80)}`,
    );
    await wait(180);
  }
  check(
    '[count api] unknown language is refused',
    (await fetch(`${BASE}/api/catalog/count?locale=xx`)).status === 422,
  );

  // URLs: non-canonical ones redirect, nonsense is ignored, combinations stay out of the index.
  await useSettings({ showOutOfStock: 'normal' });
  const redirect = async (path, target) => {
    const r = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    check(
      `[url] ${path} -> ${target}`,
      r.status === 301 &&
        new URL(r.headers.get('location') ?? '', BASE).pathname +
          new URL(r.headers.get('location') ?? '', BASE).search ===
          target,
      `${r.status} ${r.headers.get('location')}`,
    );
  };
  await redirect('/en/shop?sort=featured', '/en/shop');
  await redirect('/en/shop?page=1', '/en/shop');
  await redirect('/en/shop?min=&max=', '/en/shop');
  await redirect(`/en/shop?category=${firstCategory('en')}`, `/en/shop/${firstCategory('en')}`);
  await redirect('/en/shop?stock=1&q=tee', '/en/shop?q=tee&stock=1');
  const ignoredNonsense = async (path) => {
    const r = await readPage('en', {}, 1);
    const n = await fetch(`${BASE}${path}`, { redirect: 'follow' });
    const html = await n.text();
    const slugs = [...new Set([...html.matchAll(/href="\/en\/products\/([^"?#]+)/g)].map((m) => m[1]))];
    check(
      `[url] ${path} is ignored like no filter`,
      n.status === 200 && JSON.stringify(slugs) === JSON.stringify(r.slugs),
      `${n.status} ${slugs.length} products`,
    );
  };
  for (const path of [
    '/en/shop?min=abc',
    '/en/shop?sort=bogus',
    '/en/shop?page=-5',
    '/en/shop?page=abc',
    '/en/shop?v=bad%20id!',
    '/en/shop?stock=yes',
    '/en/shop?unknown=1',
  ])
    await ignoredNonsense(path);
  // A page past the end goes to the last real page instead of showing an empty list.
  const lastPage = Math.ceil(expected('en', {}).length / PAGE_SIZE);
  await redirect('/en/shop?page=999', `/en/shop?page=${lastPage}`);
  await redirect(`/en/shop/${firstCategory('en')}?page=999`, `/en/shop/${firstCategory('en')}`);
  const beyondFiltered = await fetch(`${BASE}/en/shop?stock=1&page=999`, { redirect: 'manual' });
  check(
    '[url] a filtered page past the end redirects too',
    beyondFiltered.status === 301,
    String(beyondFiltered.status),
  );
  check(
    '[url] an unknown category is a 404',
    (await fetch(`${BASE}/en/shop/no-such-category`)).status === 404,
  );
  const robots = async (path) =>
    /<meta[^>]+name="robots"[^>]+noindex/i.test(
      await (await fetch(`${BASE}${path}`, { redirect: 'follow' })).text(),
    );
  check('[index] /en/shop may be indexed', !(await robots('/en/shop')));
  check(
    `[index] /en/shop/${firstCategory('en')} may be indexed`,
    !(await robots(`/en/shop/${firstCategory('en')}`)),
  );
  check('[index] a filtered list is kept out of the index', await robots('/en/shop?stock=1'));
  check('[index] a search is kept out of the index', await robots('/en/shop?q=tee'));
  check('[index] a sorted list is kept out of the index', await robots('/en/shop?sort=price_asc'));
  check('[index] page 2 may be indexed', !(await robots('/en/shop?page=2')));
} finally {
  if (draftId) sql(`UPDATE products SET status = 'active' WHERE id = '${draftId}'`);
  const restored = await post('/api/admin/settings/catalog', { values: originalCatalog }, cookie);
  console.log(`catalog settings restored: ${restored.status}`);
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
if (failures.length)
  console.log(
    'FAILED:\n' +
      failures
        .slice(0, 60)
        .map((f) => `  ${f}`)
        .join('\n') +
      (failures.length > 60 ? `\n  ... and ${failures.length - 60} more` : ''),
  );
process.exitCode = failures.length ? 1 : 0;
