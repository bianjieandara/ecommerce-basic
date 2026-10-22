// Rows the report reads return: one shape per report, in the application so builders and jobs share them without the database.

/** One store-local day of sales. Days without paid orders are absent. */
export interface SalesDay {
  day: string;
  orders: number;
  units: number;
  revenueMinor: number;
  taxMinor: number;
  shippingMinor: number;
  refundOrders: number;
  refundMinor: number;
}

/** Tax of one day and one rate: the taxable base and the tax on it. Shipping tax is included at the default rate. */
export interface TaxDay {
  day: string;
  rateBp: number;
  baseMinor: number;
  taxMinor: number;
}

/** One product in a ranking, with its margin where unit costs were stored. */
export interface ProductRow {
  productId: string;
  name: string;
  units: number;
  revenueMinor: number;
  /** Net revenue of the lines that stored a unit cost. */
  costedNetMinor: number;
  /** Cost of those lines. */
  costMinor: number;
}

/** One variant of the variant breakdown. */
export interface VariantRow {
  variantId: string;
  productName: string;
  variantLabel: string;
  sku: string | null;
  units: number;
  revenueMinor: number;
}

/** Products over the period: totals and the rankings. */
export interface ProductsData {
  units: number;
  revenueMinor: number;
  products: number;
  costedNetMinor: number;
  costMinor: number;
  byUnits: ProductRow[];
  byRevenue: ProductRow[];
  variants: VariantRow[];
}

/** One category over the period. A product in several categories counts in each of them. */
export interface CategoryRow {
  categoryId: string;
  name: string;
  units: number;
  revenueMinor: number;
}

/** Categories over the period, with the totals of all lines (not the sum of the rows, which may count a product twice). */
export interface CategoriesData {
  units: number;
  revenueMinor: number;
  rows: CategoryRow[];
}

/** One payment method: what was paid in the period, and what was placed in it. */
export interface PaymentMethodRow {
  method: string;
  /** Orders paid in the period (by payment time). */
  paidOrders: number;
  revenueMinor: number;
  /** Orders refunded in the period (by payment time). */
  refundedOrders: number;
  refundedMinor: number;
  /** Orders placed in the period (by placement time). */
  placed: number;
  /** Of those placed, orders that were paid at some point. */
  converted: number;
  /** Of those placed, orders still waiting for payment. */
  pending: number;
}

/** One shipping method. */
export interface ShippingRow {
  name: string;
  orders: number;
  shippingMinor: number;
  freeOrders: number;
}

/** Invoices of one series over the period (by issue time). */
export interface InvoiceSeriesRow {
  series: string;
  issued: number;
  void: number;
  issuedMinor: number;
  voidMinor: number;
  taxMinor: number;
}

/** A variant on a stock list. */
export interface StockItem {
  variantId: string;
  name: string;
  variantLabel: string;
  sku: string | null;
  stock: number;
  threshold: number;
  costMinor: number | null;
}

/** Stock movements of one reason over the period. */
export interface MovementRow {
  reason: string;
  movements: number;
  unitsIn: number;
  unitsOut: number;
}

/** Inventory: the valuation as of now, the stock lists, the slow movers and the movements of the period. */
export interface InventoryData {
  variants: number;
  units: number;
  costMinor: number;
  retailMinor: number;
  outOfStockCount: number;
  outOfStock: StockItem[];
  lowStockCount: number;
  lowStock: StockItem[];
  slowMoverCount: number;
  slowMoverCostMinor: number;
  slowMovers: StockItem[];
  movements: MovementRow[];
}

/** A buyer in the customer lists. Buyers are identified by their e-mail address, in lower case. */
export interface CustomerRow {
  email: string;
  name: string;
  orders: number;
  spentMinor: number;
}

/** Customers over the period. A new buyer's first paid order (ever) falls in the period. */
export interface CustomersData {
  buyers: number;
  newBuyers: number;
  top: CustomerRow[];
  countries: { country: string; orders: number }[];
  cities: { city: string; country: string; orders: number }[];
}

/** One day of the daily rollup (funnel and traffic counts). */
export interface MetricsDay {
  day: string;
  pageViews: number;
  productViews: number;
  addToCarts: number;
  checkoutsStarted: number;
  ordersPlaced: number;
  ordersPaid: number;
  revenueMinor: number;
}

/** Notifications of one channel and template: how far each message got. Each column counts messages at that state or later. */
export interface NotificationRow {
  channel: string;
  template: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}
