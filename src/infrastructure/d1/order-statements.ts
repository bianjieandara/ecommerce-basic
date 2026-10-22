// The statements that place an order: counter, order row, items, stock decrements with their ledger rows, and the first
// event. They run as one D1 batch, so an order is never half stored.
import type { NewOrder } from '@/application/ports/ordering';
import { boolToInt, statement } from './d1-client';
import { addStockChange, type LedgerSlot } from './stock-ledger';

/** The statements of a placement, and where the ledger row of each sale sits in the batch (to read the stock changes back). */
export interface PlacementStatements {
  statements: D1PreparedStatement[];
  sales: LedgerSlot[];
}

/**
 * Builds the batch that places an order.
 * @param db D1 binding.
 * @param draft The order to store.
 * @returns The statements in the order they must run, and the sales they record.
 */
export function placeOrderStatements(db: D1Database, draft: NewOrder): PlacementStatements {
  const sales: LedgerSlot[] = [];
  const statements = [
    statement(db, 'UPDATE order_counter SET last_number = last_number + 1 WHERE id = 1'),
    statement(
      db,
      `INSERT INTO orders (id, number, access_key_hash, status, payment_method, payment_reference, currency, locale,
           prices_include_tax, subtotal_minor, tax_minor, shipping_minor, total_minor, customer_name, customer_email,
           customer_phone, whatsapp_opt_in, marketing_consent, billing_json, shipping_method_id, shipping_method_name,
           shipping_address_json, customer_note, tracking_code, attribution_json, stock_released, expires_at, paid_at,
           created_at, updated_at)
         VALUES (?, (SELECT last_number FROM order_counter WHERE id = 1), ?, 'pending_payment', ?, NULL, ?, ?, ?, ?, ?,
           ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 0, ?, NULL, ?, ?)`,
      [
        draft.id,
        draft.accessKeyHash,
        draft.paymentMethod,
        draft.currency,
        draft.locale,
        boolToInt(draft.pricesIncludeTax),
        draft.subtotalMinor,
        draft.taxMinor,
        draft.shippingMinor,
        draft.totalMinor,
        draft.customer.name,
        draft.customer.email,
        draft.customer.phone,
        boolToInt(draft.customer.whatsappOptIn),
        boolToInt(draft.marketingConsent),
        JSON.stringify(draft.billing),
        draft.shippingMethodId,
        draft.shippingMethodName,
        JSON.stringify(draft.shippingAddress),
        draft.note,
        JSON.stringify(draft.attribution),
        draft.expiresAt,
        draft.createdAt,
        draft.createdAt,
      ],
    ),
  ];
  for (const [index, item] of draft.items.entries()) {
    statements.push(
      statement(
        db,
        `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_label, sku, image_media_id,
             unit_price_minor, unit_cost_minor, quantity, line_total_minor, tax_rate_bp, tax_minor, stock_tracked)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${draft.id}:${index}`,
          draft.id,
          item.productId,
          item.variantId,
          item.productName,
          item.variantLabel,
          item.sku,
          item.unitPriceMinor,
          item.unitCostMinor,
          item.quantity,
          item.lineTotalMinor,
          item.taxRateBp,
          item.taxMinor,
          boolToInt(item.stockTracked),
        ],
      ),
    );
    if (item.stockTracked) {
      sales.push(
        addStockChange(db, statements, {
          variantId: item.variantId,
          delta: -item.quantity,
          reason: 'sale',
          reference: draft.id,
          note: null,
          actor: 'customer',
          nowIso: draft.createdAt,
        }),
      );
    }
  }
  statements.push(
    statement(
      db,
      `INSERT INTO order_events (id, order_id, type, note, actor, created_at) VALUES (?, ?, 'placed', NULL, 'customer', ?)`,
      [crypto.randomUUID(), draft.id, draft.createdAt],
    ),
  );
  return { statements, sales };
}
