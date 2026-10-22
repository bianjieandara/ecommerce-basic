// D1 reads of the reports. One class serves every report; the SQL lives in the modules of this folder, so the CSV files and the
// screens read the same numbers through the same methods.
import type {
  CategoriesData,
  CustomersData,
  InventoryData,
  InvoiceSeriesRow,
  MetricsDay,
  NotificationRow,
  PaymentMethodRow,
  ProductsData,
  ReportFilters,
  ReportRange,
  ReportsQueryService,
  SalesDay,
  ShippingRow,
  TaxDay,
} from '@/application/reports/ports';
import { categoriesReport, productsReport } from './reports-catalog-queries';
import { inventoryReport } from './reports-stock-queries';
import { customersReport } from './reports-customer-queries';
import { dailyMetrics, invoiceSeries, notificationCounts } from './reports-ops-queries';
import { paymentMethods, salesDays, shippingMethods, taxDays } from './reports-order-queries';

/** D1-backed reads of the reports. */
export class D1ReportsQueries implements ReportsQueryService {
  /** @param db D1 database binding. */
  constructor(private readonly db: D1Database) {}

  sales(range: ReportRange, timeZone: string): Promise<SalesDay[]> {
    return salesDays(this.db, range, timeZone);
  }

  taxes(range: ReportRange, timeZone: string, filters: ReportFilters): Promise<TaxDay[]> {
    return taxDays(this.db, range, timeZone, filters);
  }

  products(range: ReportRange, _timeZone: string, filters: ReportFilters): Promise<ProductsData> {
    return productsReport(this.db, range, filters);
  }

  categories(range: ReportRange, _timeZone: string, filters: ReportFilters): Promise<CategoriesData> {
    return categoriesReport(this.db, range, filters);
  }

  payments(range: ReportRange): Promise<PaymentMethodRow[]> {
    return paymentMethods(this.db, range);
  }

  shipping(range: ReportRange): Promise<ShippingRow[]> {
    return shippingMethods(this.db, range);
  }

  invoices(range: ReportRange, _timeZone: string, filters: ReportFilters): Promise<InvoiceSeriesRow[]> {
    return invoiceSeries(this.db, range, filters);
  }

  inventory(range: ReportRange, _timeZone: string, filters: ReportFilters): Promise<InventoryData> {
    return inventoryReport(this.db, range, filters);
  }

  customers(range: ReportRange): Promise<CustomersData> {
    return customersReport(this.db, range);
  }

  funnel(range: ReportRange): Promise<MetricsDay[]> {
    return dailyMetrics(this.db, range);
  }

  notifications(range: ReportRange): Promise<NotificationRow[]> {
    return notificationCounts(this.db, range);
  }
}
