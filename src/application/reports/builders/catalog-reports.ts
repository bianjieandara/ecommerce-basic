// Builders of the catalog reports: products (rankings, margin and variants), categories and inventory (valuation, stock lists,
// slow movers and movements). Lists are cut at the reader's limit; the totals the table reports are the complete counts.
import type { CategoriesData, InventoryData, ProductRow, ProductsData, StockItem } from '../ports';
import type { ReportTable, ReportView } from '../view';
import { count, kpiFrom, money, rate, ratioBp, tableOf, text, viewOf, type BuildContext } from './shared';
import type { CellValue } from '../view';

/** Margin of a product row: net revenue of the costed lines less their cost. Empty when no line stored a cost. */
function marginCells(row: ProductRow): [CellValue, CellValue, CellValue] {
  if (row.costedNetMinor === 0) return [money(row.costMinor), { kind: 'empty' }, { kind: 'empty' }];
  const margin = row.costedNetMinor - row.costMinor;
  return [money(row.costMinor), money(margin), rate(ratioBp(margin, row.costedNetMinor))];
}

/**
 * A ranking table of products.
 * @param id CSV name.
 * @param title Translated title.
 * @param rows Products, already ranked.
 * @returns The table.
 */
function productTable(
  id: 'units' | 'revenue',
  title: 'table.byUnits' | 'table.byRevenue',
  rows: ProductRow[],
): ReportTable {
  return tableOf(
    id,
    title,
    ['col.product', 'col.units', 'col.revenue', 'col.cost', 'col.margin', 'col.marginRate'],
    rows.map((row) => [text(row.name), count(row.units), money(row.revenueMinor), ...marginCells(row)]),
  );
}

/**
 * Products over the period: units, revenue, products sold and the margin where unit costs were stored; the rankings by units
 * and by revenue; and the variant breakdown.
 * @param current Products data of the period.
 * @param previous Products data of the period before, or null.
 * @returns The view.
 */
export function buildProducts(current: ProductsData, previous: ProductsData | null): ReportView {
  const margin = (d: ProductsData) => d.costedNetMinor - d.costMinor;
  const marginRateOf = (d: ProductsData) => ratioBp(margin(d), d.costedNetMinor);
  return viewOf('products', {
    kpis: [
      kpiFrom('kpi.revenue', current, previous, (d) => money(d.revenueMinor)),
      kpiFrom('kpi.units', current, previous, (d) => count(d.units)),
      kpiFrom('kpi.productsSold', current, previous, (d) => count(d.products)),
      kpiFrom('kpi.margin', current, previous, (d) =>
        d.costedNetMinor === 0 ? { kind: 'empty' } : money(margin(d)),
      ),
      kpiFrom('kpi.marginRate', current, previous, (d) => rate(marginRateOf(d))),
    ],
    chart: null,
    tables: [
      productTable('units', 'table.byUnits', current.byUnits),
      productTable('revenue', 'table.byRevenue', current.byRevenue),
      tableOf(
        'variants',
        'table.variants',
        ['col.product', 'col.variant', 'col.sku', 'col.units', 'col.revenue'],
        current.variants.map((row) => [
          text(row.productName),
          text(row.variantLabel),
          text(row.sku ?? ''),
          count(row.units),
          money(row.revenueMinor),
        ]),
      ),
    ],
    notes: [
      { key: 'notes.paidBasis', params: {} },
      { key: 'notes.costMissing', params: {} },
    ],
  });
}

/**
 * Categories over the period: units and revenue per category.
 * @param current Categories data of the period.
 * @param previous Categories data of the period before, or null.
 * @returns The view.
 */
export function buildCategories(current: CategoriesData, previous: CategoriesData | null): ReportView {
  return viewOf('categories', {
    kpis: [
      kpiFrom('kpi.revenue', current, previous, (d) => money(d.revenueMinor)),
      kpiFrom('kpi.units', current, previous, (d) => count(d.units)),
    ],
    chart: null,
    tables: [
      tableOf(
        'categories',
        'table.categories',
        ['col.category', 'col.units', 'col.revenue'],
        current.rows.map((row) => [text(row.name), count(row.units), money(row.revenueMinor)]),
      ),
    ],
    notes: [
      { key: 'notes.categoryMulti', params: {} },
      { key: 'notes.paidBasis', params: {} },
    ],
  });
}

/**
 * One stock list as a table. The stock is shown as it is now; the value column is the cost of the stock on the shelf.
 * @param id CSV name.
 * @param title Translated title.
 * @param items Items listed.
 * @param total Complete count of the list.
 * @param withValue Whether the table shows the value at cost.
 * @returns The table.
 */
function stockTable(
  id: string,
  title: 'table.lowStock' | 'table.outOfStock' | 'table.slowMovers',
  items: StockItem[],
  total: number,
  withValue: boolean,
): ReportTable {
  const columns: ReportTable['columns'] = ['col.product', 'col.variant', 'col.sku', 'col.stock'];
  if (title === 'table.lowStock') columns.push('col.threshold');
  if (withValue) columns.push('col.valueCost');
  return tableOf(
    id,
    title,
    columns,
    items.map((item) => {
      const cells: CellValue[] = [
        text(item.name),
        text(item.variantLabel),
        text(item.sku ?? ''),
        count(item.stock),
      ];
      if (title === 'table.lowStock') cells.push(count(item.threshold));
      if (withValue) cells.push(money(item.stock * (item.costMinor ?? 0)));
      return cells;
    }),
    total,
  );
}

/**
 * Inventory: the valuation as of now (at cost and at the selling price), the counts of out-of-stock, low-stock and slow-moving
 * variants, the lists behind them, and the movements of the period by reason.
 * @param data Inventory data.
 * @param ctx Build context (the slow-mover window, for the note).
 * @returns The view.
 */
export function buildInventory(data: InventoryData, ctx: BuildContext): ReportView {
  return viewOf('inventory', {
    kpis: [
      kpiFrom('kpi.unitsOnHand', data, null, () => count(data.units)),
      kpiFrom('kpi.valueCost', data, null, () => money(data.costMinor)),
      kpiFrom('kpi.valueRetail', data, null, () => money(data.retailMinor)),
      kpiFrom('kpi.outOfStock', data, null, () => count(data.outOfStockCount)),
      kpiFrom('kpi.lowStock', data, null, () => count(data.lowStockCount)),
      kpiFrom('kpi.slowMovers', data, null, () => count(data.slowMoverCount)),
    ],
    chart: null,
    tables: [
      stockTable('low-stock', 'table.lowStock', data.lowStock, data.lowStockCount, false),
      stockTable('out-of-stock', 'table.outOfStock', data.outOfStock, data.outOfStockCount, false),
      stockTable('slow-movers', 'table.slowMovers', data.slowMovers, data.slowMoverCount, true),
      tableOf(
        'movements',
        'table.movements',
        ['col.reason', 'col.movements', 'col.unitsIn', 'col.unitsOut'],
        data.movements.map((row) => [
          text(row.reason),
          count(row.movements),
          count(row.unitsIn),
          count(row.unitsOut),
        ]),
      ),
    ],
    notes: [
      { key: 'notes.inventory', params: {} },
      { key: 'notes.slowMovers', params: { days: ctx.slowMoverDays } },
    ],
  });
}
