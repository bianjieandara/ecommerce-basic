// Builds the product catalog feed (RSS 2.0 with the Google "g:" namespace) read by Meta Commerce Manager and
// Google Merchant Center. One builder for both: pure, so the route only loads the data and sets the headers.
import type { FeedItemDto } from '@/application/dto/catalog-dto';
import { escapeHtml } from '@/application/documents/html';
import { absoluteUrl } from '@/application/documents/urls';
import type { CurrencyCode } from '@/domain/shared/currency';
import type { Locale } from '@/domain/shared/locale';
import { majorTextOf } from '@/domain/shared/money';
import { PATHS } from '@/domain/shared/paths';

/**
 * The services that read the feed. They spell the availability differently: Meta wants "in stock", Google's specification lists
 * "in_stock". Meta is the default, so a feed URL without a target keeps working as before.
 */
export const FEED_TARGETS = ['meta', 'google'] as const;

/** A service the feed is written for. */
export type FeedTarget = (typeof FEED_TARGETS)[number];

/** Meta's limits: a longer title or description is rejected for the whole item. */
const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 5000;

/** Store-level values the feed writes into every item. */
export interface ProductFeedSettings {
  /** Brand of every item; Meta and Google both require one. */
  brand: string;
  /** Store name, used as the channel title. */
  storeName: string;
  /** Currency of every price in the catalog. */
  currency: CurrencyCode;
}

/** Everything the feed needs. */
export interface ProductFeedInput {
  items: FeedItemDto[];
  locale: Locale;
  /** Public origin without a trailing slash, for example "https://shop.example.com". */
  siteUrl: string;
  /** Address images are served from when they have their own host (from `normalizeMediaBase`); empty for this site's /media route. */
  mediaBaseUrl?: string;
  settings: ProductFeedSettings;
  /** Who reads the feed; decides the spelling of the availability. Defaults to Meta. */
  target?: FeedTarget;
}

/**
 * Removes characters XML 1.0 forbids (control characters other than tab, newline and carriage return), then escapes
 * the markup characters. A stray control character from a pasted name would otherwise make the whole feed unparseable.
 * @param value Untrusted text.
 * @returns Text that is safe inside an XML element.
 */
function xmlText(value: string): string {
  return escapeHtml(value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''));
}

/**
 * Writes one feed element. Empty optional values are skipped, never written as empty elements.
 * @param name Element name with its namespace prefix when it has one, for example "g:color".
 * @param value Text, or null/empty to skip.
 * @returns The element line, or "" when skipped.
 */
function element(name: string, value: string | null | undefined): string {
  return value ? `      <${name}>${xmlText(value)}</${name}>` : '';
}

/**
 * Formats a price as the feeds read it: the number in the currency's own precision, then the ISO code
 * ("12.00 USD", "1250 CLP"). Built from integer digits, so there is no float rounding.
 * @param amountMinor Minor units.
 * @param currency Currency code.
 * @returns Price text.
 */
function priceText(amountMinor: number, currency: CurrencyCode): string {
  return `${majorTextOf(amountMinor, currency)} ${currency}`;
}

/**
 * The availability value in the spelling of the service that reads the feed.
 * @param inStock Whether the variant can be bought.
 * @param target Meta ("in stock") or Google ("in_stock").
 * @returns The value for g:availability.
 */
function availabilityText(inStock: boolean, target: FeedTarget): string {
  const text = inStock ? 'in stock' : 'out of stock';
  return target === 'google' ? text.replaceAll(' ', '_') : text;
}

/**
 * Builds the `<item>` element of one variant. Variants without an image return null: Meta and Google reject items
 * without image_link, so leaving them out is the only way to keep the rest of the feed accepted.
 * @param item Feed row of one variant.
 * @param input Shared feed input.
 * @returns The item text, or null when the variant is skipped.
 */
function itemXml(item: FeedItemDto, input: ProductFeedInput): string | null {
  if (!item.imageKey) return null;
  const { currency, brand } = input.settings;
  const label = item.variantLabel ? ` - ${item.variantLabel}` : '';
  // Same rule as computeIsOnSale in domain/catalog/product.ts: a compare-at price above the current price is a sale.
  // The feed shows the compare-at price as the regular price and the current price as sale_price.
  const compareAt = item.compareAtPriceMinor;
  const regularMinor = compareAt !== null && compareAt > item.priceMinor ? compareAt : item.priceMinor;
  const onSale = regularMinor !== item.priceMinor;
  return [
    '    <item>',
    `      <g:id>${xmlText(item.variantId)}</g:id>`,
    `      <g:item_group_id>${xmlText(item.productId)}</g:item_group_id>`,
    element('title', `${item.name}${label}`.slice(0, MAX_TITLE_LENGTH)),
    element('description', (item.description || item.name).slice(0, MAX_DESCRIPTION_LENGTH)),
    element('link', absoluteUrl(input.siteUrl, PATHS.product(input.locale, item.slug))),
    element(
      'g:image_link',
      input.mediaBaseUrl
        ? PATHS.media(item.imageKey, input.mediaBaseUrl)
        : absoluteUrl(input.siteUrl, PATHS.media(item.imageKey)),
    ),
    `      <g:availability>${availabilityText(item.inStock, input.target ?? 'meta')}</g:availability>`,
    '      <g:condition>new</g:condition>',
    `      <g:price>${priceText(regularMinor, currency)}</g:price>`,
    onSale ? element('g:sale_price', priceText(item.priceMinor, currency)) : '',
    element('g:brand', brand),
    element('g:color', item.color),
    element('g:size', item.size),
    '    </item>',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Builds the complete feed document.
 * @param input Feed items, language, public origin and store settings.
 * @returns XML text with an XML declaration, ready to serve as application/xml.
 */
export function buildProductFeed(input: ProductFeedInput): string {
  const items = input.items.map((item) => itemXml(item, input)).filter((xml): xml is string => xml !== null);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    `    <title>${xmlText(input.settings.storeName)}</title>`,
    `    <link>${xmlText(absoluteUrl(input.siteUrl, PATHS.home(input.locale)))}</link>`,
    `    <description>${xmlText(input.settings.storeName)}</description>`,
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
