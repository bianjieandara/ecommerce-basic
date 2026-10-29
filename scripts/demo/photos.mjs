// Puts a vertical demo's photographs into its store. The pictures are generated with Workers AI on the owner's own
// Cloudflare account and land in that client's R2 bucket under ai/<key>.jpg; this script pulls them down and uploads
// them through the admin API, the same door the page builder uses, so they become real media assets.
//
// Usage: node scripts/demo/photos.mjs <slug> --prompts     prints the prompts as JSON, one per picture
//        node scripts/demo/photos.mjs <slug> --fetch       copies the generated pictures out of the client's bucket
//        node scripts/demo/photos.mjs <slug> --apply       uploads them and attaches them to products, categories, hero
// The store must be running (DOCS_BASE) and filled, because --apply saves the home page again with the new hero.
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, readClient } from '../lib/clients.mjs';
import { runStep } from '../lib/run.mjs';
import { post, sql } from '../docs/shared.mjs';
import { ownerCookie } from '../docs/owner-session.mjs';
import { upload } from '../docs/pictures.mjs';
import { loadVertical } from './seed-vertical.mjs';

/** Where the pictures of a demo are kept once pulled out of its bucket. */
const folderFor = (slug) => join(ROOT, '.wrangler', 'ai', slug);

/** The width the generator produces. Workers AI's flux-1-schnell answers a square of this side. */
const GENERATED_WIDTH = 1024;

/**
 * Every picture a vertical needs, as a key and the prompt that draws it. The key names where the picture belongs:
 * `hero-<n>`, a category id or a product id.
 * @param {object} vertical The catalogue module.
 * @returns {Record<string, string>} Prompt per key.
 */
export function promptsFor(vertical) {
  const { photoStyle, photos } = vertical;
  const prompts = {};
  photos.hero.forEach((subject, index) => {
    // A hero is a band, not a tile, so its subject is a scene rather than one object.
    prompts[`hero-${index}`] = `Photograph of ${subject}, ${photoStyle}`;
  });
  for (const [id, subject] of Object.entries(photos.categories))
    prompts[id] = `Photograph of ${subject}, ${photoStyle}`;
  for (const [id, subject] of Object.entries(photos.products))
    prompts[id] = `Product photograph of ${subject}, ${photoStyle}`;
  return prompts;
}

/**
 * Copies the generated pictures out of the client's R2 bucket into .wrangler/ai/<slug>.
 * @param {string} slug Demo store slug.
 * @param {string[]} keys Picture keys to fetch.
 */
function fetchPictures(slug, keys) {
  const bucket = readClient(slug).r2.bucket;
  const folder = folderFor(slug);
  mkdirSync(folder, { recursive: true });
  for (const key of keys) {
    const file = join(folder, `${key}.jpg`);
    if (existsSync(file)) continue;
    const result = runStep({
      command: 'npx',
      args: ['wrangler', 'r2', 'object', 'get', `${bucket}/ai/${key}.jpg`, '--remote', '--file', file],
      capture: true,
    });
    if (!result.ok) throw new Error(`Could not fetch ai/${key}.jpg from ${bucket}:\n${result.output}`);
  }
  console.log(`${slug}: ${keys.length} pictures in ${folder}`);
}

/**
 * Uploads the pictures and attaches each one where it belongs.
 * @param {string} slug Demo store slug.
 * @param {object} vertical The catalogue module.
 */
async function applyPictures(slug, vertical) {
  const folder = folderFor(slug);
  if (!existsSync(folder)) throw new Error(`No pictures yet: run --fetch first (${folder}).`);
  const cookie = await ownerCookie();
  const keys = readdirSync(folder)
    .filter((name) => name.endsWith('.jpg'))
    .map((name) => name.replace(/\.jpg$/, ''));

  /** Uploads one file and returns its media id. */
  const put = async (key) => {
    const bytes = readFileSync(join(folder, `${key}.jpg`));
    return upload(cookie, key, { [GENERATED_WIDTH]: bytes }, GENERATED_WIDTH, GENERATED_WIDTH);
  };

  const hero = [];
  for (const key of keys.filter((name) => name.startsWith('hero-')).sort()) hero.push(await put(key));

  for (const key of keys.filter((name) => name.startsWith('cat-'))) {
    const mediaId = await put(key);
    sql(`UPDATE categories SET image_media_id = '${mediaId}' WHERE id = '${key}'`);
  }

  for (const key of keys.filter((name) => name.startsWith('prod-'))) {
    const mediaId = await put(key);
    // A product keeps one picture: the drawn placeholder goes, the photograph takes its place.
    sql(`DELETE FROM product_images WHERE product_id = '${key}'`);
    sql(`INSERT INTO product_images (product_id, media_id, position) VALUES ('${key}', '${mediaId}', 0)`);
  }

  // The hero ids live inside the home page's sections, so the page is saved again with the new ones.
  if (hero.length > 0) {
    const page = sql("SELECT id FROM pages WHERE slug = 'home'")[0];
    const saved = await post(
      `/api/admin/pages/${page?.id ?? 'home'}`,
      {
        title: { es: 'Inicio', en: 'Home' },
        seoTitle: { es: '', en: '' },
        seoDescription: { es: '', en: '' },
        isPublished: true,
        sections: vertical.home(hero),
      },
      cookie,
    );
    if (!saved.json?.ok)
      throw new Error(`Could not save the home page: ${JSON.stringify(saved.json?.error)}`);
  }
  // Every run uploads new assets, and the ones it replaced stay behind. They would travel in the snapshot and be copied
  // to R2 on every publish, so anything nothing points at any more goes. The JSON columns are checked too: a hero lives
  // inside a page's sections and the logo inside a settings group, and neither is a foreign key.
  sql(`DELETE FROM media_assets
       WHERE id NOT IN (SELECT media_id FROM product_images)
         AND id NOT IN (SELECT image_media_id FROM categories WHERE image_media_id IS NOT NULL)
         AND id NOT IN (SELECT image_media_id FROM product_variants WHERE image_media_id IS NOT NULL)
         AND id NOT IN (SELECT avatar_media_id FROM testimonials WHERE avatar_media_id IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM pages p WHERE p.sections_json LIKE '%' || media_assets.id || '%')
         AND NOT EXISTS (SELECT 1 FROM settings s WHERE s.value_json LIKE '%' || media_assets.id || '%')`);
  const left = sql('SELECT COUNT(*) AS n FROM media_assets')[0].n;
  console.log(`${slug}: ${keys.length} photographs in place, ${left} media assets kept`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const slug = argv.find((argument) => !argument.startsWith('--'));
  if (!slug) throw new Error('Usage: node scripts/demo/photos.mjs <slug> [--prompts|--fetch|--apply]');
  const vertical = await loadVertical(slug);
  if (!vertical.photos) throw new Error(`${slug} has no photo prompts yet.`);
  const prompts = promptsFor(vertical);

  if (argv.includes('--prompts')) process.stdout.write(`${JSON.stringify(prompts, null, 1)}\n`);
  else if (argv.includes('--fetch')) fetchPictures(slug, Object.keys(prompts));
  else if (argv.includes('--apply')) await applyPictures(slug, vertical);
  else throw new Error('Pick one of --prompts, --fetch or --apply.');
}
