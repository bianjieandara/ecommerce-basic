// Report reads over products, categories and stock. The order lines come from the snapshot columns, so a renamed product keeps
// its name in the past; the stock lists use the current catalog, because they describe the shelf as it is now.
import type {
  CategoriesData,
  ProductRow,
  ProductsData,
  ReportFilters,
  ReportRange,
  VariantRow,
} from '@/application/reports/ports';
import { statement, type SqlValue } from './d1-client';
import { CATEGORY_NAME_SQL, paidInRange } from './reports-sql';

/** Products in each ranking. */
const TOP_PRODUCTS = 20;
/** Variants in the variant breakdown. */
const TOP_VARIANTS = 50;
/** Categories listed. */
const TOP_CATEGORIES = 50;

/** Net amount of an order line: the line without its tax, whether the price included tax or not. */
const NET_LINE_SQL = `CASE WHEN o.prices_include_tax = 1 THEN oi.line_total_minor - oi.tax_minor ELSE oi.line_total_minor END`;

/** Cost of an order line, only for lines that stored a unit cost (older lines and lines without one stay out of the margin). */
const COSTED_NET_SQL = `CASE WHEN oi.unit_cost_minor IS NOT NULL THEN ${NET_LINE_SQL} END`;
const COST_SQL = `CASE WHEN oi.unit_cost_minor IS NOT NULL THEN oi.unit_cost_minor * oi.quantity END`;

/**
 * Order lines of paid orders in the period, with the optional category condition. Binds follow the SQL order.
 * @param range The period.
 * @param filters Uses the category.
 * @returns The FROM and WHERE, and their binds.
 */
function lineScope(range: ReportRange, filters: ReportFilters): { from: string; binds: SqlValue[] } {
  const paid = paidInRange(range);
  const category = filters.categoryId
    ? {
        sql: ' AND EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = oi.product_id AND pc.category_id = ?)',
        binds: [filters.categoryId],
      }
    : { sql: '', binds: [] as SqlValue[] };
  return {
    from: `FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${paid.sql}${category.sql}`,
    binds: [...paid.binds, ...category.binds],
  };
}

/** Row of a product ranking. */
interface ProductDbRow {
  product_id: string;
  name: string | null;
  units: number;
  revenue: number;
  costed_net: number | null;
  cost: number | null;
}

/**
 * Maps a product ranking row.
 * @param row Database row.
 * @returns The ranking row.
 */
function toProduct(row: ProductDbRow): ProductRow {
  return {
    productId: row.product_id,
    name: row.name ?? '',
    units: row.units,
    revenueMinor: row.revenue,
    costedNetMinor: row.costed_net ?? 0,
    costMinor: row.cost ?? 0,
  };
}

/**
 * Products over the period: the totals, the top products by units and by revenue, and the variant breakdown.
 * @param db D1 database.
 * @param range The period.
 * @param filters Locale for names, and the category.
 * @returns The products data.
 */
export async function productsReport(
  db: D1Database,
  range: ReportRange,
  filters: ReportFilters,
): Promise<ProductsData> {
  const scope = lineScope(range, filters);
  const results = await db.batch([
    statement(
      db,
      `SELECT COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.line_total_minor), 0) AS revenue,
              COUNT(DISTINCT oi.product_id) AS products, SUM(${COSTED_NET_SQL}) AS costed_net, SUM(${COST_SQL}) AS cost
       ${scope.from}`,
      scope.binds,
    ),
    statement(
      db,
      `SELECT oi.product_id AS product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS units,
              SUM(oi.line_total_minor) AS revenue, SUM(${COSTED_NET_SQL}) AS costed_net, SUM(${COST_SQL}) AS cost
       ${scope.from} GROUP BY oi.product_id ORDER BY units DESC, oi.product_id ASC LIMIT ${TOP_PRODUCTS}`,
      scope.binds,
    ),
    statement(
      db,
      `SELECT oi.product_id AS product_id, MAX(oi.product_name) AS name, SUM(oi.quantity) AS units,
              SUM(oi.line_total_minor) AS revenue, SUM(${COSTED_NET_SQL}) AS costed_net, SUM(${COST_SQL}) AS cost
       ${scope.from} GROUP BY oi.product_id ORDER BY revenue DESC, oi.product_id ASC LIMIT ${TOP_PRODUCTS}`,
      scope.binds,
    ),
    statement(
      db,
      `SELECT oi.variant_id AS variant_id, MAX(oi.product_name) AS product, MAX(oi.variant_label) AS label,
              MAX(oi.sku) AS sku, SUM(oi.quantity) AS units, SUM(oi.line_total_minor) AS revenue
       ${scope.from} GROUP BY oi.variant_id ORDER BY revenue DESC, oi.variant_id ASC LIMIT ${TOP_VARIANTS}`,
      scope.binds,
    ),
  ]);
  const totals = (
    (results[0]?.results ?? []) as {
      units: number;
      revenue: number;
      products: number;
      costed_net: number | null;
      cost: number | null;
    }[]
  )[0];
  const variants = (
    (results[3]?.results ?? []) as {
      variant_id: string;
      product: string | null;
      label: string | null;
      sku: string | null;
      units: number;
      revenue: number;
    }[]
  ).map((row): VariantRow => ({
    variantId: row.variant_id,
    productName: row.product ?? '',
    variantLabel: row.label ?? '',
    sku: row.sku,
    units: row.units,
    revenueMinor: row.revenue,
  }));
  return {
    units: totals?.units ?? 0,
    revenueMinor: totals?.revenue ?? 0,
    products: totals?.products ?? 0,
    costedNetMinor: totals?.costed_net ?? 0,
    costMinor: totals?.cost ?? 0,
    byUnits: ((results[1]?.results ?? []) as ProductDbRow[]).map(toProduct),
    byRevenue: ((results[2]?.results ?? []) as ProductDbRow[]).map(toProduct),
    variants,
  };
}

/**
 * Categories over the period. The totals come from all lines, so a product in two categories is not counted twice in them.
 * @param db D1 database.
 * @param range The period.
 * @param filters Locale for the names.
 * @returns The categories data.
 */
export async function categoriesReport(
  db: D1Database,
  range: ReportRange,
  filters: ReportFilters,
): Promise<CategoriesData> {
  const paid = paidInRange(range);
  const results = await db.batch([
    statement(
      db,
      `SELECT COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.line_total_minor), 0) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${paid.sql}`,
      paid.binds,
    ),
    statement(
      db,
      `SELECT c.id AS category_id, ${CATEGORY_NAME_SQL} AS name, SUM(oi.quantity) AS units,
              SUM(oi.line_total_minor) AS revenue
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN product_categories pc ON pc.product_id = oi.product_id
       JOIN categories c ON c.id = pc.category_id
       WHERE ${paid.sql}
       GROUP BY c.id ORDER BY revenue DESC, c.id ASC LIMIT ${TOP_CATEGORIES}`,
      [filters.locale, ...paid.binds],
    ),
  ]);
  const totals = ((results[0]?.results ?? []) as { units: number; revenue: number }[])[0];
  return {
    units: totals?.units ?? 0,
    revenueMinor: totals?.revenue ?? 0,
    rows: (
      (results[1]?.results ?? []) as {
        category_id: string;
        name: string | null;
        units: number;
        revenue: number;
      }[]
    ).map((row) => ({
      categoryId: row.category_id,
      name: row.name ?? '',
      units: row.units,
      revenueMinor: row.revenue,
    })),
  };
}
