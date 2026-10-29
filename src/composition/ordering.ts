// Wiring of ordering, payments and invoicing: gateways, checkout, payment confirmation, expiry, and the invoice use cases.
// Kept apart from the container, like the admin catalog and inventory, so the container stays a list of what exists.
import type { EvaluateStockChanges } from '@/application/inventory/evaluate-stock-changes';
import type { SettingsRepository } from '@/application/ports/content';
import type { InvoiceRepository, LegalInvoiceIssuer, PdfRenderer } from '@/application/ports/invoicing';
import type { JobQueue } from '@/application/ports/jobs';
import type { MediaStorage } from '@/application/ports/media';
import type { OrderRepository } from '@/application/ports/ordering';
import type { PaymentEventLog, PaymentGateway, PaymentMethod } from '@/application/ports/payments';
import type { BotVerifier, CacheStore, Clock, Hasher, IdGenerator } from '@/application/ports/platform';
import { QuoteCart } from '@/application/cart/quote-cart';
import { CapturePayment } from '@/application/ordering/capture-payment';
import { ConfirmPayment } from '@/application/ordering/confirm-payment';
import { ExpireStaleOrders } from '@/application/ordering/expire-orders';
import { GetOrderStatus } from '@/application/ordering/get-order-status';
import { OrderLinks } from '@/application/ordering/order-links';
import { RefundOrder } from '@/application/ordering/refund-order';
import { PlaceOrder } from '@/application/ordering/place-order';
import { GetInvoiceHtml } from '@/application/invoicing/get-invoice-html';
import { GetInvoicePdf } from '@/application/invoicing/get-invoice-pdf';
import { IssueInvoice } from '@/application/invoicing/issue-invoice';
import { IssueLegalInvoice } from '@/application/invoicing/issue-legal-invoice';
import { RenderInvoicePdf } from '@/application/invoicing/render-invoice-pdf';
import { VoidInvoice } from '@/application/invoicing/void-invoice';
import { NotificationService } from '@/application/notifications/notification-service';
import { D1CatalogQueryService } from '@/infrastructure/d1/catalog-query-service';
import { ReportPurchase } from '@/application/marketing/report-purchase';
import { logEvent } from '@/infrastructure/system/logger';
import { D1ShippingMethodRepository } from '@/infrastructure/d1/shipping-repository';
import { readSecret } from '@/infrastructure/cloudflare/env';
import { BrowserRunPdfRenderer, NoopLegalInvoiceIssuer } from '@/infrastructure/invoicing/invoicing-adapters';
import {
  BankTransferGateway,
  CashOnDeliveryGateway,
  DeunaGateway,
  WhatsAppGateway,
} from '@/infrastructure/payments/manual-gateways';
import { PayPalGateway } from '@/infrastructure/payments/paypal-gateway';
import { DLocalGoGateway } from '@/infrastructure/payments/dlocalgo-gateway';

/** The ordering services the container exposes. */
export interface OrderingServices {
  legal: LegalInvoiceIssuer;
  pdf: PdfRenderer;
  issueInvoice: IssueInvoice;
  renderInvoicePdf: RenderInvoicePdf;
  issueLegalInvoice: IssueLegalInvoice;
  expireStaleOrders: ExpireStaleOrders;
  dlocalgo: DLocalGoGateway;
  paypal: PayPalGateway;
  gateways: Record<PaymentMethod, PaymentGateway>;
  confirmPayment: ConfirmPayment;
  capturePayment: CapturePayment;
  quoteCart: (options: { newDays: number }) => QuoteCart;
  placeOrder: PlaceOrder;
  orderStatus: GetOrderStatus;
  invoicePdf: GetInvoicePdf;
  invoiceHtml: GetInvoiceHtml;
  voidInvoice: VoidInvoice;
  refundOrder: RefundOrder;
}

/** Dependencies of the ordering wiring. */
export interface OrderingDeps {
  clock: Clock;
  ids: IdGenerator;
  hasher: Hasher;
  cache: CacheStore;
  settings: SettingsRepository;
  jobs: JobQueue;
  notifications: NotificationService;
  botVerifier: BotVerifier;
  media: MediaStorage;
  orders: OrderRepository;
  invoices: InvoiceRepository;
  paymentEvents: PaymentEventLog;
  evaluateStock: EvaluateStockChanges;
  siteUrl: string;
}

/**
 * Builds the ordering, payment and invoicing services from the Worker environment.
 * @param env Worker bindings and vars (DB, BROWSER, PAYPAL_ENV and the payment secrets are used).
 * @param deps Shared services.
 * @returns The wired services.
 */
export function createOrdering(env: Env, deps: OrderingDeps): OrderingServices {
  const { clock, ids, hasher, cache, settings, jobs, notifications, botVerifier, media } = deps;
  const { orders, invoices, paymentEvents, evaluateStock, siteUrl } = deps;
  const legal = new NoopLegalInvoiceIssuer();
  const pdf = new BrowserRunPdfRenderer(env.BROWSER);
  const pdfDeps = { invoices, settings, pdf, media, clock };
  const issueInvoice = new IssueInvoice({ orders, invoices, settings, jobs, legal, clock, ids });
  const links = new OrderLinks({ orders, hasher });
  const renderInvoicePdf = new RenderInvoicePdf({ ...pdfDeps, orders, notifications, links, siteUrl });
  const issueLegalInvoice = new IssueLegalInvoice({ invoices, legal, clock });
  const expireStaleOrders = new ExpireStaleOrders({
    orders,
    notifications,
    settings,
    evaluateStock,
    links,
    clock,
    siteUrl,
    log: logEvent,
  });

  const dlocalgo = new DLocalGoGateway({
    apiKey: readSecret('DLOCALGO_API_KEY'),
    secretKey: readSecret('DLOCALGO_SECRET_KEY'),
    environment: readSecret('DLOCALGO_ENV') === 'live' ? 'live' : 'sandbox',
  });
  const paypal = new PayPalGateway(
    {
      clientId: readSecret('PAYPAL_CLIENT_ID'),
      clientSecret: readSecret('PAYPAL_CLIENT_SECRET'),
      webhookId: readSecret('PAYPAL_WEBHOOK_ID'),
      environment: String(env.PAYPAL_ENV) === 'live' ? 'live' : 'sandbox',
    },
    cache,
  );
  const gateways: Record<PaymentMethod, PaymentGateway> = {
    dlocalgo,
    paypal,
    whatsapp: new WhatsAppGateway(),
    bank_transfer: new BankTransferGateway(),
    cash_on_delivery: new CashOnDeliveryGateway(),
    deuna: new DeunaGateway(),
  };
  const confirmPayment = new ConfirmPayment({
    orders,
    events: paymentEvents,
    notifications,
    settings,
    jobs,
    evaluateStock,
    links,
    clock,
    log: logEvent,
    siteUrl,
    purchase: new ReportPurchase({ jobs, settings, clock, log: logEvent }),
  });
  const quoteCart = ({ newDays }: { newDays: number }) =>
    new QuoteCart({
      catalog: new D1CatalogQueryService(env.DB, { newDays, now: () => clock.now() }),
      shipping: new D1ShippingMethodRepository(env.DB),
    });
  const placeOrder = new PlaceOrder({
    settings,
    quoteCart,
    orders,
    gateways,
    botVerifier,
    hasher,
    ids,
    clock,
    notifications,
    evaluateStock,
    siteUrl,
  });
  const orderStatus = new GetOrderStatus({ orders, invoices, hasher });
  return {
    legal,
    pdf,
    issueInvoice,
    renderInvoicePdf,
    issueLegalInvoice,
    expireStaleOrders,
    dlocalgo,
    paypal,
    gateways,
    confirmPayment,
    capturePayment: new CapturePayment({ orders, gateways, confirmPayment }),
    quoteCart,
    placeOrder,
    orderStatus,
    invoicePdf: new GetInvoicePdf({ ...pdfDeps, orderStatus, invoices, media }),
    invoiceHtml: new GetInvoiceHtml({ orderStatus, invoices, settings }),
    voidInvoice: new VoidInvoice({ invoices, orders, clock, ids, media }),
    refundOrder: new RefundOrder({
      orders,
      gateways,
      events: paymentEvents,
      confirmPayment,
      clock,
      siteUrl,
      onError: (event, error) =>
        logEvent(event, { error: error instanceof Error ? error.message : 'unknown' }),
    }),
  };
}
