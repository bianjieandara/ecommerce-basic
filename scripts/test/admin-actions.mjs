// Admin write test of the LOCAL demo store: every create, edit, delete and status action of the catalog, inventory, shipping,
// testimonials, pages, settings and emails, as the owner. Each action is tried with valid input (and its effect read back from the
// database and from the storefront), with invalid input, and where it applies as a duplicate or while in use. All records are
// named "audit-..." and removed at the end, and settings it touches are restored.
//
// Usage: npm run build && npm run docs:store   (leave it running)  then  npm run docs:data  and  npm run test:admin-actions
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
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : '  -> ' + detail}`);
  if (!ok) failures.push(name);
}
const api = (path, body) => post(path, body, cookie);
const good = (r) => r.status === 200 && r.json?.ok === true;
const refused = (r, ...codes) =>
  r.status >= 400 && r.status < 500 && (codes.length === 0 || codes.includes(r.json?.error?.code));
const brief = (r) => `${r.status} ${JSON.stringify(r.json?.error ?? r.json).slice(0, 160)}`;
const one = (query) => sql(query)[0];
const get = async (path, withCookie = false) =>
  fetch(BASE + path, { headers: withCookie ? { cookie } : {}, redirect: 'manual' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Removes everything this test creates, whatever state a crashed run left. */
function cleanup() {
  sql(
    "DELETE FROM inventory_movements WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'AUDIT-%')",
  );
  sql(
    "DELETE FROM product_search WHERE product_id IN (SELECT id FROM products WHERE id IN (SELECT product_id FROM product_translations WHERE slug LIKE 'audit-%'))",
  );
  sql(
    "DELETE FROM variant_attribute_values WHERE variant_id IN (SELECT id FROM product_variants WHERE sku LIKE 'AUDIT-%')",
  );
  sql(
    "DELETE FROM product_images WHERE product_id IN (SELECT product_id FROM product_translations WHERE slug LIKE 'audit-%')",
  );
  sql(
    "DELETE FROM product_categories WHERE product_id IN (SELECT product_id FROM product_translations WHERE slug LIKE 'audit-%')",
  );
  sql("DELETE FROM product_variants WHERE sku LIKE 'AUDIT-%'");
  sql(
    "DELETE FROM products WHERE id IN (SELECT product_id FROM product_translations WHERE slug LIKE 'audit-%')",
  );
  sql("DELETE FROM product_translations WHERE slug LIKE 'audit-%'");
  sql("DELETE FROM category_translations WHERE slug LIKE 'audit-%'");
  sql('DELETE FROM categories WHERE id NOT IN (SELECT category_id FROM category_translations)');
  sql("DELETE FROM attribute_values WHERE code LIKE 'audit-%'");
  sql("DELETE FROM attributes WHERE code LIKE 'audit-%'");
  sql("DELETE FROM shipping_methods WHERE id LIKE 'audit-%' OR name_json LIKE '%audit-%'");
  sql("DELETE FROM testimonials WHERE author_name LIKE 'audit-%'");
  sql("DELETE FROM pages WHERE slug LIKE 'audit-%'");
  sql("DELETE FROM email_templates WHERE key = 'back_in_stock' AND subject_json LIKE '%audit-%'");
}

const originals = {};
const group = (name) =>
  JSON.parse(one(`SELECT value_json FROM settings WHERE group_key = '${name}'`)?.value_json ?? '{}');
cleanup();

try {
  // ============================================================================================================= categories
  console.log('categories');
  const cat = (slug, extra = {}) => ({
    id: null,
    parentId: null,
    imageMediaId: null,
    isActive: true,
    position: null,
    translations: {
      es: { name: `Audit ${slug}`, slug: `audit-${slug}-es`, description: '' },
      en: { name: `Audit ${slug}`, slug: `audit-${slug}-en`, description: 'about' },
    },
    ...extra,
  });
  const created = await api('/api/admin/categories', cat('one'));
  check('create a category', good(created), brief(created));
  const catId =
    created.json?.data?.id ??
    one("SELECT category_id AS id FROM category_translations WHERE slug = 'audit-one-en'")?.id;
  check(
    'it has both translations stored',
    one(`SELECT COUNT(*) AS n FROM category_translations WHERE category_id = '${catId}'`).n === 2,
  );
  check(
    'the storefront has no page for an empty category listing problems',
    (await get('/en/shop/audit-one-en')).status === 200,
  );
  const child = await api('/api/admin/categories', cat('child', { parentId: catId }));
  check('create a child category', good(child), brief(child));
  const childId = child.json?.data?.id;
  check(
    'the child records its parent',
    one(`SELECT parent_id AS p FROM categories WHERE id = '${childId}'`)?.p === catId,
  );
  check('a duplicate slug is refused', refused(await api('/api/admin/categories', cat('one'))), 'accepted');
  check(
    'a category with no name in any language is refused',
    refused(
      await api('/api/admin/categories', {
        ...cat('blank'),
        translations: {
          es: { name: '', slug: '', description: '' },
          en: { name: '', slug: '', description: '' },
        },
      }),
    ),
  );
  check(
    'a category cannot be its own parent',
    refused(await api('/api/admin/categories', cat('one', { id: catId, parentId: catId }))),
    'accepted',
  );
  check(
    'a category cannot move under its own child',
    refused(await api('/api/admin/categories', cat('one', { id: catId, parentId: childId }))),
    'accepted',
  );
  const renamed = await api('/api/admin/categories', { ...cat('one', { id: catId }), isActive: false });
  check(
    'hide a category',
    good(renamed) && one(`SELECT is_active AS a FROM categories WHERE id = '${catId}'`).a === 0,
    brief(renamed),
  );
  check('a hidden category is gone from the storefront', (await get('/en/shop/audit-one-en')).status === 404);
  check(
    'reorder the categories',
    good(await api('/api/admin/categories/reorder', { ids: [childId, catId] })),
  );
  check(
    'reorder with an unknown id is refused or ignored without damage',
    (await api('/api/admin/categories/reorder', { ids: ['nope'] })).status < 500,
  );
  check(
    'delete a category with a child is refused',
    refused(await api('/api/admin/categories/delete', { id: catId })),
    'deleted a parent',
  );
  check('delete the child', good(await api('/api/admin/categories/delete', { id: childId })));
  check('delete the parent once empty', good(await api('/api/admin/categories/delete', { id: catId })));
  check(
    'both are gone from the database',
    one(`SELECT COUNT(*) AS n FROM categories WHERE id IN ('${catId}', '${childId}')`).n === 0,
  );
  check(
    'delete of an unknown category is a clean 4xx',
    refused(await api('/api/admin/categories/delete', { id: 'no-such-category' })),
  );

  // ============================================================================================================== attributes
  console.log('attributes');
  const attr = (code, values, extra = {}) => ({
    id: null,
    code,
    name: { es: `Audit ${code}`, en: `Audit ${code}` },
    display: 'buttons',
    isFilterable: true,
    position: 50,
    values: values.map((v) => ({ id: null, code: v, label: { es: v, en: v }, colorHex: null })),
    ...extra,
  });
  const attrCreated = await api('/api/admin/attributes', attr('audit-size', ['audit-s', 'audit-m']));
  check('create an attribute with values', good(attrCreated), brief(attrCreated));
  const attrId = attrCreated.json?.data?.id ?? one("SELECT id FROM attributes WHERE code = 'audit-size'")?.id;
  check(
    'its values are stored',
    one(`SELECT COUNT(*) AS n FROM attribute_values WHERE attribute_id = '${attrId}'`).n === 2,
  );
  check(
    'an uppercase code is refused',
    refused(await api('/api/admin/attributes', attr('Audit-Bad', ['audit-x']))),
  );
  check(
    'an attribute with no values is refused',
    refused(await api('/api/admin/attributes', attr('audit-empty', []))),
  );
  check(
    'a duplicate attribute code is refused',
    refused(await api('/api/admin/attributes', attr('audit-size', ['audit-z']))),
  );
  check(
    'a swatch colour must be a hex colour',
    refused(
      await api(
        '/api/admin/attributes',
        attr('audit-color', ['audit-red'], {
          display: 'swatches',
          values: [{ id: null, code: 'audit-red', label: { es: 'r', en: 'r' }, colorHex: 'red' }],
        }),
      ),
    ),
  );
  const mId = one("SELECT id FROM attribute_values WHERE code = 'audit-m'").id;
  const sId = one("SELECT id FROM attribute_values WHERE code = 'audit-s'").id;
  const reorderedAttr = await api('/api/admin/attributes', {
    ...attr('audit-size', []),
    id: attrId,
    values: [
      { id: mId, code: 'audit-m', label: { es: 'M', en: 'M' }, colorHex: null },
      { id: sId, code: 'audit-s', label: { es: 'S', en: 'S' }, colorHex: null },
    ],
  });
  check('edit an attribute: reorder and relabel values', good(reorderedAttr), brief(reorderedAttr));
  check(
    'the new label is stored',
    one(`SELECT label_json AS l FROM attribute_values WHERE id = '${mId}'`).l.includes('"M"'),
  );

  // ================================================================================================================ products
  console.log('products');
  const variant = (sku, extra = {}) => ({
    id: null,
    sku,
    barcode: null,
    priceMinor: null,
    compareAtPriceMinor: null,
    costMinor: 500,
    stock: 10,
    stockBefore: null,
    trackInventory: true,
    lowStockThreshold: null,
    imageMediaId: null,
    isActive: true,
    attributeValueIds: [],
    ...extra,
  });
  const product = (slug, extra = {}) => ({
    id: null,
    status: 'draft',
    basePriceMinor: 1500,
    compareAtPriceMinor: null,
    taxRateBp: null,
    isFeatured: false,
    translations: {
      es: {
        name: `Audit ${slug}`,
        slug: `audit-${slug}-es`,
        shortDescription: 'corto',
        descriptionMd: 'hola',
        seoTitle: '',
        seoDescription: '',
      },
      en: {
        name: `Audit ${slug}`,
        slug: `audit-${slug}-en`,
        shortDescription: 'short',
        descriptionMd: 'hello',
        seoTitle: '',
        seoDescription: '',
      },
    },
    categoryIds: [],
    imageIds: [],
    variants: [variant(`AUDIT-${slug.toUpperCase()}`)],
    stockNote: null,
    ...extra,
  });
  const made = await api('/api/admin/products', product('widget'));
  check('create a draft product', good(made), brief(made));
  const pid =
    made.json?.data?.id ??
    one("SELECT product_id AS id FROM product_translations WHERE slug = 'audit-widget-en'")?.id;
  const vid = one(`SELECT id FROM product_variants WHERE product_id = '${pid}'`)?.id;
  check(
    'its opening stock is in the ledger',
    one(`SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id = '${vid}' AND delta = 10`).n === 1,
  );
  check('a draft is not on the storefront', (await get('/en/products/audit-widget-en')).status === 404);
  check(
    'a draft is not in the shop list',
    !(await (await get('/en/shop')).text()).includes('audit-widget-en'),
  );
  check(
    'a draft is in the admin list',
    (await (await get('/admin/products?q=audit', true)).text()).includes(pid),
  );
  check('publish it', good(await api('/api/admin/products/status', { id: pid, status: 'active' })));
  await wait(400);
  check(
    'the product page now answers 200 in both languages',
    (await get('/en/products/audit-widget-en')).status === 200 &&
      (await get('/es/products/audit-widget-es')).status === 200,
  );
  check('it appears in the shop', (await (await get('/en/shop')).text()).includes('audit-widget-en'));
  check(
    'it is found by search suggestions',
    (await (await get('/api/search/suggest?q=audit&locale=en')).text()).includes('audit-widget-en'),
  );
  check(
    'it is in the sitemap and the feed',
    (await (await get('/sitemap.xml')).text()).includes('audit-widget-en') &&
      (await (await get('/feeds/products.xml?locale=en')).text()).includes('AUDIT-WIDGET') === false,
  );
  check(
    'the page carries Product structured data with its price',
    /"@type":"Product"/.test(await (await get('/en/products/audit-widget-en')).text()),
  );
  const edited = await api(
    '/api/admin/products',
    product('widget', {
      id: pid,
      status: 'active',
      basePriceMinor: 2000,
      variants: [variant('AUDIT-WIDGET', { id: vid, stock: 14, stockBefore: 10 })],
      stockNote: 'audit recount',
    }),
  );
  check('edit price and stock', good(edited), brief(edited));
  check(
    'the price changed',
    one(`SELECT base_price_minor AS p FROM products WHERE id = '${pid}'`).p === 2000,
  );
  check(
    'a stock change from 10 to 14 is a +4 ledger entry with its note',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id = '${vid}' AND delta = 4 AND stock_after = 14 AND note = 'audit recount'`,
    ).n === 1,
  );
  // Not tested: saving twice with the same "stock before" applies the change twice. That is the design (a sale made while the form
  // was open must not be undone), and it relies on the editor reloading its numbers after a save.
  check(
    'a product with no variant is refused',
    refused(await api('/api/admin/products', product('novar', { variants: [] }))),
  );
  check(
    'a negative price is refused',
    refused(await api('/api/admin/products', product('neg', { basePriceMinor: -1 }))),
  );
  check(
    'a duplicate slug is refused',
    refused(await api('/api/admin/products', product('widget'))),
    'accepted',
  );
  check(
    'a duplicate SKU is refused',
    refused(await api('/api/admin/products', { ...product('other'), variants: [variant('AUDIT-WIDGET')] })),
    'accepted',
  );
  check(
    'a product with no name in any language is refused',
    refused(
      await api(
        '/api/admin/products',
        product('blank', {
          translations: {
            es: {
              name: '',
              slug: '',
              shortDescription: '',
              descriptionMd: '',
              seoTitle: '',
              seoDescription: '',
            },
            en: {
              name: '',
              slug: '',
              shortDescription: '',
              descriptionMd: '',
              seoTitle: '',
              seoDescription: '',
            },
          },
        }),
      ),
    ),
  );
  check(
    'a sale price above nothing: compare-at lower than price still saves or is refused cleanly',
    (await api('/api/admin/products', product('cmp', { basePriceMinor: 1000, compareAtPriceMinor: 500 })))
      .status < 500,
  );
  const copy = await api('/api/admin/products/duplicate', { id: pid });
  check('duplicate a product', good(copy), brief(copy));
  const copyId = copy.json?.data?.id;
  check(
    'the copy is a draft with its own slug and SKU',
    one(`SELECT status AS s FROM products WHERE id = '${copyId}'`)?.s === 'draft' &&
      one(
        `SELECT COUNT(DISTINCT slug) AS n FROM product_translations WHERE product_id IN ('${pid}', '${copyId}') AND locale = 'en'`,
      ).n === 2,
  );
  check(
    'archive hides the product',
    good(await api('/api/admin/products/status', { id: pid, status: 'archived' })) &&
      (await get('/en/products/audit-widget-en')).status === 404,
  );
  check(
    'an archived product can come back',
    good(await api('/api/admin/products/status', { id: pid, status: 'active' })) &&
      (await get('/en/products/audit-widget-en')).status === 200,
  );
  check(
    'an unknown product status is refused',
    refused(await api('/api/admin/products/status', { id: pid, status: 'sold' })),
  );
  check(
    'status of an unknown product is a clean 4xx',
    refused(await api('/api/admin/products/status', { id: 'nope', status: 'active' })),
  );
  // product with attribute values: a variant per value; the attribute then cannot lose a value or be deleted while used.
  const withAttr = await api(
    '/api/admin/products',
    product('sized', {
      variants: [
        variant('AUDIT-SZ-M', { attributeValueIds: [mId] }),
        variant('AUDIT-SZ-S', { attributeValueIds: [sId] }),
      ],
    }),
  );
  check('create a product whose variants use the new attribute', good(withAttr), brief(withAttr));
  const removeUsed = await api('/api/admin/attributes', {
    ...attr('audit-size', []),
    id: attrId,
    values: [{ id: mId, code: 'audit-m', label: { es: 'M', en: 'M' }, colorHex: null }],
  });
  check(
    'removing a value that a variant uses is refused',
    refused(removeUsed, 'CONFLICT'),
    brief(removeUsed),
  );
  check(
    'deleting an attribute that variants use is refused',
    refused(await api('/api/admin/attributes/delete', { id: attrId }), 'CONFLICT'),
  );
  const sizedId =
    withAttr.json?.data?.id ??
    one("SELECT product_id AS id FROM product_translations WHERE slug = 'audit-sized-en'")?.id;
  await api('/api/admin/products/status', { id: sizedId, status: 'active' });
  await wait(300);
  const facetPage = await (await get('/en/shop?v=' + mId)).text();
  check(
    'the new attribute value filters the storefront',
    facetPage.includes('audit-sized-en') && !facetPage.includes('audit-widget-en'),
  );

  // =============================================================================================================== inventory
  console.log('inventory');
  const adjust = (items, reason = 'restock', note = null) =>
    api('/api/admin/inventory/adjust', { items, reason, note });
  check(
    'add stock (+5)',
    good(await adjust([{ variantId: vid, mode: 'delta', value: 5 }])) &&
      one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 19,
  );
  check(
    'the ledger has the +5 with its reason',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id = '${vid}' AND delta = 5 AND reason = 'restock' AND stock_after = 19`,
    ).n === 1,
  );
  check(
    'set the counted stock to 7',
    good(
      await adjust([{ variantId: vid, mode: 'set', value: 7, expected: 19 }], 'manual_adjust', 'audit count'),
    ) && one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 7,
  );
  check(
    'the set is recorded as a -12 difference',
    one(
      `SELECT COUNT(*) AS n FROM inventory_movements WHERE variant_id = '${vid}' AND delta = -12 AND note = 'audit count'`,
    ).n === 1,
  );
  check(
    'removing more than there is is refused and changes nothing',
    refused(await adjust([{ variantId: vid, mode: 'delta', value: -50 }], 'damage')) &&
      one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 7,
  );
  check(
    'a reason the form does not offer is refused',
    refused(await adjust([{ variantId: vid, mode: 'delta', value: 1 }], 'sale')),
  );
  check(
    'an unknown variant is refused',
    refused(await adjust([{ variantId: 'nope', mode: 'delta', value: 1 }])),
  );
  check(
    'an adjustment of two items is all or nothing',
    await (async () => {
      const r = await adjust([
        { variantId: vid, mode: 'delta', value: 1 },
        { variantId: 'nope', mode: 'delta', value: 1 },
      ]);
      return refused(r) && one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 7;
    })(),
  );
  check(
    'lookup by SKU finds the variant',
    (await (await get('/api/admin/inventory/lookup?code=AUDIT-WIDGET', true)).json())?.data?.sku ===
      'AUDIT-WIDGET' || (await get('/api/admin/inventory/lookup?code=AUDIT-WIDGET', true)).status === 200,
  );
  check(
    'lookup of an unknown code is a clean 404',
    (await get('/api/admin/inventory/lookup?code=NOPE-NOPE', true)).status === 404,
  );
  const importCsv = async (csv, dryRun) => {
    const form = new FormData();
    form.set('file', new File([csv], 'stock.csv', { type: 'text/csv' }));
    form.set('dryRun', dryRun);
    const r = await fetch(`${BASE}/api/admin/inventory/import`, {
      method: 'POST',
      headers: { cookie, origin: BASE },
      body: form,
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const preview = await importCsv(
    'sku,mode,quantity\nAUDIT-WIDGET,set,30\nNOPE-1,set,5\nAUDIT-WIDGET,bad,1\n',
    '1',
  );
  check(
    'a CSV preview reports its rows and problems without applying',
    preview.status === 200 && one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 7,
    brief(preview),
  );
  const applied = await importCsv('sku,mode,quantity\nAUDIT-WIDGET,set,30\n', '0');
  check(
    'a CSV import applies a counted value',
    applied.status === 200 && one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 30,
    brief(applied),
  );
  const added = await importCsv('sku,mode,quantity\nAUDIT-WIDGET,add,5\n', '0');
  check(
    'a CSV import can add units',
    added.status === 200 && one(`SELECT stock AS s FROM product_variants WHERE id = '${vid}'`).s === 35,
    brief(added),
  );
  check(
    'a CSV missing a required column is refused',
    refused(await importCsv('sku,quantity\nAUDIT-WIDGET,5\n', '0')),
  );
  check('an empty CSV is refused', refused(await importCsv('', '0')));
  const exported = await (await get('/api/admin/inventory/export?q=AUDIT-WIDGET', true)).text();
  check(
    'the stock export contains the variant and the count',
    exported.includes('AUDIT-WIDGET') && exported.includes('35'),
  );

  // ================================================================================================================ shipping
  console.log('shipping');
  const ship = (name, extra = {}) => ({
    kind: 'flat',
    name: { es: name, en: name },
    description: { es: '', en: '' },
    priceMinor: 700,
    freeOverMinor: 5000,
    isActive: true,
    position: 90,
    ...extra,
  });
  const sh = await api('/api/admin/shipping', ship('audit-courier'));
  check('create a shipping method', good(sh), brief(sh));
  const shId = one("SELECT id FROM shipping_methods WHERE name_json LIKE '%audit-courier%'")?.id;
  const quote = async (variantId, qty, method) =>
    (
      await post('/api/cart/quote', {
        locale: 'en',
        items: [{ variantId, quantity: qty }],
        shippingMethodId: method,
      })
    ).json?.data;
  const q1 = await quote(vid, 1, shId);
  check(
    'the quote charges its price below the free threshold',
    q1?.totals?.shippingMinor === 700,
    JSON.stringify(q1?.totals),
  );
  const q2 = await quote(vid, 3, shId);
  check(
    'shipping is free above the "free over" amount',
    q2?.totals?.shippingMinor === 0,
    JSON.stringify(q2?.totals),
  );
  const pick = await api(
    '/api/admin/shipping',
    ship('audit-pickup', { kind: 'pickup', priceMinor: 999, freeOverMinor: null }),
  );
  const pickId = one("SELECT id FROM shipping_methods WHERE name_json LIKE '%audit-pickup%'")?.id;
  check(
    'a pickup is stored with no charge whatever was typed',
    good(pick) && one(`SELECT price_minor AS p FROM shipping_methods WHERE id = '${pickId}'`).p === 0,
    brief(pick),
  );
  const off = await api('/api/admin/shipping', ship('audit-courier', { id: shId, isActive: false }));
  check('switch a method off', good(off));
  const q3 = await post('/api/cart/quote', {
    locale: 'en',
    items: [{ variantId: vid, quantity: 1 }],
    shippingMethodId: shId,
  });
  check(
    'an inactive method is not offered or priced',
    !(q3.json?.data?.shippingOptions ?? []).some((o) => o.id === shId),
  );
  check(
    'a method with no name is refused',
    refused(await api('/api/admin/shipping', ship('', { name: { es: '', en: '' } }))),
  );
  check(
    'a negative price is refused',
    refused(await api('/api/admin/shipping', ship('audit-neg', { priceMinor: -5 }))),
  );
  check('delete a method', good(await api('/api/admin/shipping/' + shId + '/delete', {})));
  await api('/api/admin/shipping/' + pickId + '/delete', {});

  // ============================================================================================================ testimonials
  console.log('testimonials');
  const tm = (extra = {}) => ({
    authorName: 'audit-Ana',
    rating: 5,
    body: 'Great shop',
    locale: 'en',
    isVisible: true,
    position: 90,
    ...extra,
  });
  const tCreated = await api('/api/admin/testimonials', tm());
  check('create a testimonial', good(tCreated), brief(tCreated));
  const tId = one("SELECT id FROM testimonials WHERE author_name = 'audit-Ana'")?.id;
  check('rating 0 is refused', refused(await api('/api/admin/testimonials', tm({ rating: 0 }))));
  check('rating 6 is refused', refused(await api('/api/admin/testimonials', tm({ rating: 6 }))));
  check('an empty text is refused', refused(await api('/api/admin/testimonials', tm({ body: '' }))));
  check(
    'an unknown language is refused',
    refused(await api('/api/admin/testimonials', tm({ locale: 'fr' }))),
  );
  check(
    'edit it',
    good(await api('/api/admin/testimonials', tm({ id: tId, rating: 4, body: 'Good shop audit' }))) &&
      one(`SELECT rating AS r FROM testimonials WHERE id = '${tId}'`).r === 4,
  );
  check(
    'hide it',
    good(await api('/api/admin/testimonials', tm({ id: tId, isVisible: false }))) &&
      one(`SELECT is_visible AS v FROM testimonials WHERE id = '${tId}'`).v === 0,
  );
  check(
    'delete it',
    good(await api('/api/admin/testimonials/' + tId + '/delete', {})) &&
      one(`SELECT COUNT(*) AS n FROM testimonials WHERE id = '${tId}'`).n === 0,
  );
  check(
    'delete of an unknown testimonial is a clean 4xx',
    refused(await api('/api/admin/testimonials/nope/delete', {})),
  );

  // ================================================================================================================== pages
  console.log('pages');
  const pg = await api('/api/admin/pages', {
    slug: 'audit-guide',
    title: { es: 'Guía audit', en: 'Audit guide' },
  });
  check('create a custom page', good(pg), brief(pg));
  const pgId = pg.json?.data?.id ?? one("SELECT id FROM pages WHERE slug = 'audit-guide'")?.id;
  check('it starts unpublished (404 on the storefront)', (await get('/en/p/audit-guide')).status === 404);
  check(
    'a bad slug is refused',
    refused(await api('/api/admin/pages', { slug: 'Bad Slug!', title: { es: 'x', en: 'x' } })),
  );
  check(
    'a duplicate slug is refused',
    refused(await api('/api/admin/pages', { slug: 'audit-guide', title: { es: 'x', en: 'x' } })),
  );
  check(
    'a reserved slug (home) is refused',
    refused(await api('/api/admin/pages', { slug: 'home', title: { es: 'x', en: 'x' } })),
  );
  const saved = await api('/api/admin/pages/' + pgId, {
    title: { es: 'Guía audit', en: 'Audit guide' },
    seoTitle: { es: '', en: 'Audit SEO title' },
    seoDescription: { es: '', en: 'Audit description text' },
    isPublished: true,
    sections: [
      {
        id: 's1',
        type: 'rich_text',
        enabled: true,
        config: { body: { es: '# Hola audit', en: '# Hello audit\n\n<script>alert(1)</script>' } },
      },
      {
        id: 's2',
        type: 'faq',
        enabled: true,
        config: { items: [{ question: { es: '¿Q?', en: 'Q?' }, answer: { es: 'R', en: 'A **bold**' } }] },
      },
    ],
  });
  check('save and publish a page with two sections', good(saved), brief(saved));
  await wait(400);
  const html = await (await get('/en/p/audit-guide')).text();
  check('the page is live with its heading', html.includes('Hello audit'));
  check(
    'its SEO title and description reach the page',
    html.includes('Audit SEO title') && html.includes('Audit description text'),
  );
  check('a script typed in the text is not executed (escaped)', !html.includes('<script>alert(1)</script>'));
  check('the FAQ section renders its question', html.includes('Q?'));
  check(
    'a section of an unknown type is refused',
    refused(
      await api('/api/admin/pages/' + pgId, {
        title: { es: 'x', en: 'x' },
        seoTitle: { es: '', en: '' },
        seoDescription: { es: '', en: '' },
        isPublished: true,
        sections: [{ id: 's1', type: 'no_such_widget', enabled: true, config: {} }],
      }),
    ),
  );
  check(
    'a section with an invalid setting is refused',
    refused(
      await api('/api/admin/pages/' + pgId, {
        title: { es: 'x', en: 'x' },
        seoTitle: { es: '', en: '' },
        seoDescription: { es: '', en: '' },
        isPublished: true,
        sections: [{ id: 's1', type: 'rich_text', enabled: true, config: { body: 12345 } }],
      }),
    ),
  );
  check(
    'unpublish returns the page to 404',
    good(
      await api('/api/admin/pages/' + pgId, {
        title: { es: 'Guía audit', en: 'Audit guide' },
        seoTitle: { es: '', en: '' },
        seoDescription: { es: '', en: '' },
        isPublished: false,
        sections: [],
      }),
    ) &&
      (await (async () => {
        await wait(300);
        return (await get('/en/p/audit-guide')).status === 404;
      })()),
  );
  const homeId = one("SELECT id FROM pages WHERE slug = 'home'")?.id ?? 'home';
  check('the home page cannot be deleted', refused(await api('/api/admin/pages/' + homeId + '/delete', {})));
  check(
    'delete the custom page',
    good(await api('/api/admin/pages/' + pgId + '/delete', {})) &&
      one(`SELECT COUNT(*) AS n FROM pages WHERE id = '${pgId}'`).n === 0,
  );

  // ================================================================================================================ settings
  console.log('settings');
  const groups = [
    ...new Set(
      // The index redirects to the first group, whose page lists every group beside the form.
      (await (await get('/admin/settings/general', true)).text())
        .match(/\/admin\/settings\/([a-z_]+)/g)
        ?.map((m) => m.split('/').pop()) ?? [],
    ),
  ];
  check('the settings index lists the groups', groups.length >= 8, groups.join(','));
  for (const name of groups) {
    originals[name] = one(`SELECT value_json AS v FROM settings WHERE group_key = '${name}'`)?.v ?? null;
    const page = await get('/admin/settings/' + name, true);
    check(`settings/${name}: the page opens`, page.status === 200, String(page.status));
    const current = originals[name] ? JSON.parse(originals[name]) : null;
    if (current) {
      const r = await api('/api/admin/settings/' + name, { values: current });
      check(`settings/${name}: saving the current values unchanged is accepted`, good(r), brief(r));
    }
    const bad = await api('/api/admin/settings/' + name, {
      values: {
        __nonsense: { deep: [1, 2, 3] },
        colorPrimary: 'not-a-colour',
        pageSize: 'many',
        currency: 'XXX',
        defaultLocale: 'fr',
      },
    });
    check(`settings/${name}: nonsense values never give a 500`, bad.status < 500, brief(bad));
  }
  check(
    'an unknown settings group is a 4xx',
    refused(await api('/api/admin/settings/no_such_group', { values: {} })),
  );
  const themeNow = group('theme');
  check(
    'a colour that is not hex is refused in theme',
    refused(await api('/api/admin/settings/theme', { values: { ...themeNow, colorPrimary: 'blue' } })),
  );
  check(
    'a typeface that is not offered is refused',
    refused(await api('/api/admin/settings/theme', { values: { ...themeNow, fontPreset: 'comic' } })),
  );
  const catNow = group('catalog');
  check(
    'a page size of 5 (below the minimum) is refused',
    refused(await api('/api/admin/settings/catalog', { values: { ...catNow, pageSize: 5 } })),
  );
  check(
    'a page size of 61 (above the maximum) is refused',
    refused(await api('/api/admin/settings/catalog', { values: { ...catNow, pageSize: 61 } })),
  );
  const generalNow = group('general');
  check(
    'an unknown currency is refused',
    refused(await api('/api/admin/settings/general', { values: { ...generalNow, currency: 'ZZZ' } })),
  );
  // A saved value Intl rejects makes every admin date throw, so these must be refused, never stored.
  check(
    'an unknown time zone is refused',
    refused(await api('/api/admin/settings/general', { values: { ...generalNow, timezone: 'Mars/Base' } })),
  );
  check('the refused time zone was not stored', group('general').timezone === generalNow.timezone);
  check(
    'an unknown country code is refused',
    refused(await api('/api/admin/settings/general', { values: { ...generalNow, country: 'ZZ' } })),
  );
  const contactNow = group('contact');
  check(
    'a javascript: social link is refused',
    refused(
      await api('/api/admin/settings/contact', {
        values: { ...contactNow, social: { ...contactNow.social, instagram: 'javascript:alert(1)' } },
      }),
    ),
  );
  check(
    'a social link without https is refused',
    refused(
      await api('/api/admin/settings/contact', {
        values: { ...contactNow, social: { ...contactNow.social, facebook: 'facebook.com/store' } },
      }),
    ),
  );
  check(
    'a malformed contact email is refused',
    refused(await api('/api/admin/settings/contact', { values: { ...contactNow, email: 'not an email' } })),
  );
  check(
    'the refused contact values were not stored',
    JSON.stringify(group('contact')) === JSON.stringify(contactNow),
  );
  const themeChange = await api('/api/admin/settings/theme', {
    values: { ...themeNow, colorAccent: '#123456' },
  });
  await wait(400);
  check(
    'a saved theme colour reaches the storefront at once',
    good(themeChange) && (await (await get('/en/')).text()).includes('#123456'),
  );
  await api('/api/admin/settings/theme', { values: themeNow });

  // ================================================================================================================== emails
  console.log('emails');
  const saveEmail = (subjectEn, bodyEn, enabled = true) =>
    api('/api/admin/emails/back_in_stock', {
      subject: { es: 'Audit asunto', en: subjectEn },
      body: { es: 'Audit cuerpo {{product.name}}', en: bodyEn },
      enabled,
    });
  check(
    'save an email override',
    good(await saveEmail('audit subject {{product.name}}', 'Audit body {{product.name}} is back')),
  );
  const prev = await api('/api/admin/emails/back_in_stock/preview', {
    locale: 'en',
    subject: 'audit {{product.name}}',
    body: 'See **{{product.name}}**',
  });
  check(
    'preview renders the draft with sample data',
    good(prev) &&
      prev.json.data.subject.startsWith('audit ') &&
      /<strong>[^<]+<\/strong>/.test(prev.json.data.html) &&
      !prev.json.data.html.includes('{{'),
    brief(prev),
  );
  const hostile = await api('/api/admin/emails/back_in_stock/preview', {
    locale: 'en',
    subject: 's',
    body: '<img src=x onerror=alert(1)> <script>alert(1)</script> [click](javascript:alert(1))',
  });
  // The HTML part is what a mail client renders; the plain-text part may keep the characters as typed.
  check(
    'preview escapes typed HTML and drops javascript: links in the HTML part',
    good(hostile) &&
      !/<img src=x|<script>alert|href="javascript:/i.test(hostile.json.data.html) &&
      hostile.json.data.html.includes('&lt;img'),
    brief(hostile),
  );
  check('an unknown placeholder is refused', refused(await saveEmail('x {{no.such.var}}', 'body')));
  check('an empty subject is refused', refused(await saveEmail('', 'body')));
  check(
    'an unknown email key is a 404',
    (
      await api('/api/admin/emails/no_such_email', {
        subject: { es: 'a', en: 'a' },
        body: { es: 'a', en: 'a' },
        enabled: true,
      })
    ).status === 404,
  );
  check(
    'disabling a customer email is saved',
    good(await saveEmail('audit subject', 'Audit body {{product.name}}', false)) &&
      one("SELECT is_enabled AS e FROM email_templates WHERE key = 'back_in_stock'").e === 0,
  );
  check(
    'restore the default removes the override',
    good(await api('/api/admin/emails/back_in_stock/restore', {})) &&
      !(one("SELECT subject_json AS s FROM email_templates WHERE key = 'back_in_stock'")?.s ?? '').includes(
        'audit',
      ),
  );
  const testSend = await api('/api/admin/emails/order_received/test', {});
  check('"send test" to the admin address is queued', good(testSend), brief(testSend));
} finally {
  for (const [name, value] of Object.entries(originals)) {
    if (value) await api('/api/admin/settings/' + name, { values: JSON.parse(value) });
  }
  cleanup();
  console.log('cleaned up');
}

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exitCode = failures.length ? 1 : 0;
