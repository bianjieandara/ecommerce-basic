// Filters of the inventory screens, read from the query string. A list, its paging and its CSV export all read them here, so a
// filtered view and the file exported from it always agree.
import type { InventoryFilter, MovementFilter } from '@/application/ports/inventory';
import { STOCK_REASONS, STOCK_STATUSES } from '@/domain/inventory/stock';
import type { Locale } from '@/domain/shared/locale';
import { positiveInteger } from './list-query';

/** Rows per page on the inventory and ledger screens. */
export const INVENTORY_PAGE_SIZE = 25;

/** Most rows one CSV export writes. */
export const EXPORT_ROW_LIMIT = 5000;

/** Stock states the table can be filtered by. */
const STATUSES = ['all', ...STOCK_STATUSES] as const;

/** Orders of the table. */
const SORTS: readonly InventoryFilter['sort'][] = ['name', 'stock_asc', 'stock_desc', 'value_desc'];

/** A calendar day as YYYY-MM-DD. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Reads the stock table filters. Unknown values fall back to "everything".
 * @param params Query string of the page or of the export.
 * @param locale Language of the names.
 * @param defaultThreshold Store default low-stock threshold.
 * @param pageSize Rows per page.
 * @returns The filters and the page.
 */
export function inventoryFilterFrom(
  params: URLSearchParams,
  locale: Locale,
  defaultThreshold: number,
  pageSize: number,
): InventoryFilter {
  return {
    search: searchText(params),
    categoryId: params.get('category') || null,
    status: oneOf(params.get('status'), STATUSES, 'all'),
    sort: oneOf(params.get('sort'), SORTS, 'name'),
    locale,
    defaultThreshold,
    page: positiveInteger(params.get('page')),
    pageSize,
  };
}

/**
 * Reads the ledger filters. Values that do not parse are ignored.
 * @param params Query string of the page or of the export.
 * @param locale Language of the names.
 * @param timeZone The store's time zone, which the date filters follow.
 * @param pageSize Rows per page.
 * @returns The filters and the page.
 */
export function movementFilterFrom(
  params: URLSearchParams,
  locale: Locale,
  timeZone: string,
  pageSize: number,
): MovementFilter {
  return {
    search: searchText(params),
    variantId: params.get('variant') || null,
    reason: STOCK_REASONS.find((reason) => reason === params.get('reason')) ?? null,
    from: dayOf(params.get('from')),
    to: dayOf(params.get('to')),
    timeZone,
    locale,
    page: positiveInteger(params.get('page')),
    pageSize,
  };
}

/**
 * The search text of a list: trimmed and capped, so one query cannot send an unbounded LIKE pattern.
 * @param params Query string.
 * @returns The text, possibly empty.
 */
function searchText(params: URLSearchParams): string {
  return (params.get('q') ?? '').trim().slice(0, 120);
}

/**
 * Picks an allowed value from the query, or the fallback.
 * @param value Raw query value.
 * @param allowed Values that are accepted.
 * @param fallback Value used when the query holds none of them.
 * @returns The chosen value.
 */
function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((option) => option === value) ?? fallback;
}

/**
 * A calendar day from the query.
 * @param value Raw query value.
 * @returns The day, or null when it is missing or not YYYY-MM-DD.
 */
function dayOf(value: string | null): string | null {
  return value && DAY.test(value) ? value : null;
}
