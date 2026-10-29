// Draws the demo store's pictures in Chrome (product shots, category tiles, hero banners) and uploads them to the media library
// the way the admin does: several widths per picture. No photo is downloaded; everything is drawn from colours and emoji, so the
// demo has example images without any licence to track. Replace them with real photos from the admin in a real store.
import { readFileSync } from 'node:fs';
import { openBrowser } from './chrome.mjs';
import { BASE, sql } from './shared.mjs';

/** Light colour, dark colour and symbol of each seed product's picture. */
const PRODUCT_LOOKS = {
  'prod-tee': ['#dbeafe', '#3b82f6', '👕'],
  'prod-hoodie': ['#ede9fe', '#8b5cf6', '🧥'],
  'prod-cap': ['#fee2e2', '#ef4444', '🧢'],
  'prod-bottle': ['#d1fae5', '#10b981', '🍶'],
  'prod-mug': ['#fef3c7', '#f59e0b', '☕'],
  'prod-candle': ['#fce7f3', '#ec4899', '🕯️'],
  'prod-pillow': ['#cffafe', '#06b6d4', '🛋️'],
  'prod-tote': ['#ecfccb', '#84cc16', '👜'],
  'prod-notebook': ['#e2e8f0', '#64748b', '📓'],
  'prod-sticker': ['#ffedd5', '#f97316', '⭐'],
  'prod-blanket': ['#f3e8ff', '#a855f7', '🧶'],
  'prod-plant': ['#dcfce7', '#22c55e', '🪴'],
};

/** Category tiles: palette and the symbols drawn on them. */
export const CATEGORY_LOOKS = {
  'cat-tees': ['#dbeafe', '#2563eb', ['👕', '🧥', '🧢']],
  'cat-acc': ['#fef3c7', '#d97706', ['🍶', '👜', '☕']],
  'cat-home': ['#fce7f3', '#be185d', ['🕯️', '🛋️', '🪴']],
};

/** Hero banners: palette and symbols. The left side stays free for the headline. */
export const HERO_LOOKS = [
  ['#3b1810', '#c8784a', ['👕', '🧥', '🧢']],
  ['#26301f', '#a9b88a', ['🪴', '🕯️', '🛋️']],
  ['#4a2f17', '#e3b873', ['☕', '👜', '🍶']],
];

const STUDIO_SHADOW = 'filter:drop-shadow(0 28px 28px rgba(0,0,0,.28))';

/**
 * Page for a product shot: a soft studio backdrop, the product and a shadow on the floor.
 * @param light Light colour of the backdrop.
 * @param dark Dark colour of the backdrop.
 * @param symbol The product.
 * @returns HTML for a 960 x 960 picture.
 */
function productHtml([light, dark, symbol]) {
  return `<body style="margin:0;width:960px;height:960px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 38%,${light} 0%,${light} 38%,${dark}55 100%)"><div style="position:absolute;bottom:150px;width:460px;height:64px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(22px)"></div><div style="position:relative;font-size:440px;line-height:1;${STUDIO_SHADOW}">${symbol}</div></body>`;
}

/**
 * Page for a category tile: three products on a coloured backdrop.
 * @param light Light colour.
 * @param dark Dark colour.
 * @param symbols Three symbols.
 * @returns HTML for a 960 x 960 picture.
 */
function categoryHtml([light, dark, symbols]) {
  const [a, b, c] = symbols;
  return `<body style="margin:0;width:960px;height:960px;overflow:hidden;position:relative;background:linear-gradient(160deg,${light},${dark}88)"><div style="position:absolute;left:60px;top:230px;font-size:250px;line-height:1;transform:rotate(-12deg);${STUDIO_SHADOW}">${a}</div><div style="position:absolute;left:300px;top:120px;font-size:360px;line-height:1;${STUDIO_SHADOW}">${b}</div><div style="position:absolute;left:600px;top:300px;font-size:250px;line-height:1;transform:rotate(10deg);${STUDIO_SHADOW}">${c}</div></body>`;
}

/**
 * Page for a hero banner: a deep colour with the products on the right.
 * @param dark Deep colour.
 * @param light Light colour.
 * @param symbols Three symbols.
 * @returns HTML for a 1600 x 700 picture.
 */
function heroHtml([dark, light, symbols]) {
  const [a, b, c] = symbols;
  return `<body style="margin:0;width:1600px;height:700px;overflow:hidden;position:relative;background:linear-gradient(110deg,${dark} 20%,${light}cc 140%)"><div style="position:absolute;left:880px;top:240px;font-size:260px;line-height:1;transform:rotate(-10deg);${STUDIO_SHADOW}">${a}</div><div style="position:absolute;left:1040px;top:70px;font-size:420px;line-height:1;${STUDIO_SHADOW}">${b}</div><div style="position:absolute;left:1340px;top:300px;font-size:240px;line-height:1;transform:rotate(12deg);${STUDIO_SHADOW}">${c}</div></body>`;
}

/**
 * Renders a page as JPEGs of several widths.
 * @param browser Chrome session.
 * @param html The page.
 * @param width Width of the page in pixels.
 * @param height Height of the page in pixels.
 * @param widths Widths to produce.
 * @returns Bytes per width.
 */
async function render(browser, html, width, height, widths) {
  const sizes = {};
  for (const target of widths) {
    await browser.cdp('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: target / width,
      mobile: false,
    });
    await browser.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`, 400);
    const path = `.wrangler/docs-pic-${target}.jpg`;
    await browser.shot(path, { format: 'jpeg', quality: 84 });
    sizes[target] = readFileSync(path);
  }
  return sizes;
}

/**
 * Uploads one picture to the media library.
 * @param cookie Admin session.
 * @param name Original file name.
 * @param sizes Bytes per width.
 * @param width Width of the full picture.
 * @param height Height of the full picture.
 * @returns The new media asset id.
 */
async function upload(cookie, name, sizes, width, height) {
  const form = new FormData();
  form.set('originalName', `${name}.jpg`);
  form.set('width', String(width));
  form.set('height', String(height));
  for (const [size, bytes] of Object.entries(sizes)) {
    form.set(`size-${size}`, new File([bytes], `${size}.jpg`, { type: 'image/jpeg' }));
  }
  const response = await fetch(`${BASE}/api/admin/media`, {
    method: 'POST',
    headers: { cookie, origin: BASE },
    body: form,
  });
  const json = await response.json();
  if (!json.ok) throw new Error(`Upload failed: ${JSON.stringify(json.error)}`);
  return json.data.id ?? json.data.asset?.id;
}

/**
 * Gives every product without a picture its product shot.
 * @param cookie Admin session.
 */
export async function addProductPictures(cookie) {
  const products = sql(
    `SELECT p.id, t.name FROM products p JOIN product_translations t ON t.product_id = p.id AND t.locale = 'en'
       WHERE NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id) ORDER BY p.id`,
  );
  if (products.length === 0) return;
  const browser = await openBrowser({ port: 9411, width: 960, height: 960 });
  try {
    for (const product of products) {
      const look = PRODUCT_LOOKS[product.id] ?? ['#e2e8f0', '#64748b', '📦'];
      const sizes = await render(browser, productHtml(look), 960, 960, [960, 480]);
      const mediaId = await upload(cookie, product.name, sizes, 960, 960);
      sql(
        `INSERT INTO product_images (product_id, media_id, position) VALUES ('${product.id}', '${mediaId}', 0)`,
      );
    }
  } finally {
    browser.close();
  }
}

/**
 * Gives every category without a picture its tile.
 * @param cookie Admin session.
 */
export async function addCategoryPictures(cookie) {
  const categories = sql(
    `SELECT c.id, t.name FROM categories c JOIN category_translations t ON t.category_id = c.id AND t.locale = 'en' WHERE c.image_media_id IS NULL`,
  );
  if (categories.length === 0) return;
  const browser = await openBrowser({ port: 9412, width: 960, height: 960 });
  try {
    for (const category of categories) {
      // A catalogue this script does not know gets a neutral tile rather than none: a category with no picture at all
      // is an empty block in the tile layouts, which reads as broken rather than as plain.
      // Three symbols, like every other look: the tile draws a fixed three, and a shorter list paints "undefined".
      const look = CATEGORY_LOOKS[category.id] ?? ['#e2e8f0', '#64748b', ['📦', '📦', '📦']];
      const sizes = await render(browser, categoryHtml(look), 960, 960, [960, 480]);
      const mediaId = await upload(cookie, `category ${category.name}`, sizes, 960, 960);
      sql(`UPDATE categories SET image_media_id = '${mediaId}' WHERE id = '${category.id}'`);
    }
  } finally {
    browser.close();
  }
}

/**
 * Draws and uploads the hero banners.
 * @param cookie Admin session.
 * @returns The media ids, in the order of HERO_LOOKS.
 */
export async function addHeroPictures(cookie) {
  const browser = await openBrowser({ port: 9413, width: 1600, height: 700 });
  try {
    const ids = [];
    for (const [index, look] of HERO_LOOKS.entries()) {
      const sizes = await render(browser, heroHtml(look), 1600, 700, [1600, 960, 480]);
      ids.push(await upload(cookie, `hero ${index + 1}`, sizes, 1600, 700));
    }
    return ids;
  } finally {
    browser.close();
  }
}
