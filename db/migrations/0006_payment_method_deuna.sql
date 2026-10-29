-- Deuna! (the Banco Pichincha wallet) joins the payment methods. SQLite cannot change a CHECK constraint in place, so orders is
-- rebuilt with the new list, as 0003 did for dLocal Go. 'stripe' stays allowed so orders already stored with it remain valid
-- history, and the two GA columns added by 0005 are part of the new table.
--
-- Three tables reference orders (order_items and order_events with ON DELETE CASCADE, invoices without). Dropping orders while
-- they exist would either delete their rows or leave unresolvable foreign key violations, so they are copied aside, dropped
-- first, and recreated (same definitions as 0003) once the new orders table is in place.

CREATE TABLE _order_items_copy AS SELECT * FROM order_items;
CREATE TABLE _order_events_copy AS SELECT * FROM order_events;
CREATE TABLE _invoices_copy AS SELECT * FROM invoices;

DROP TABLE order_items;
DROP TABLE order_events;
DROP TABLE invoices;

CREATE TABLE orders_new (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  access_key_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'dlocalgo', 'paypal', 'whatsapp', 'bank_transfer', 'cash_on_delivery', 'deuna')),
  payment_reference TEXT,
  currency TEXT NOT NULL,
  locale TEXT NOT NULL,
  prices_include_tax INTEGER NOT NULL,
  subtotal_minor INTEGER NOT NULL,
  tax_minor INTEGER NOT NULL,
  shipping_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  billing_json TEXT NOT NULL DEFAULT '{}',
  shipping_method_id TEXT,
  shipping_method_name TEXT NOT NULL,
  shipping_address_json TEXT NOT NULL DEFAULT '{}',
  customer_note TEXT NOT NULL DEFAULT '',
  tracking_code TEXT,
  attribution_json TEXT NOT NULL DEFAULT '{}',
  stock_released INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ga_client_id TEXT,
  ga_session_id TEXT
);

INSERT INTO orders_new (
  id, number, access_key_hash, status, payment_method, payment_reference, currency, locale, prices_include_tax, subtotal_minor,
  tax_minor, shipping_minor, total_minor, customer_name, customer_email, customer_phone, whatsapp_opt_in, marketing_consent,
  billing_json, shipping_method_id, shipping_method_name, shipping_address_json, customer_note, tracking_code, attribution_json,
  stock_released, expires_at, paid_at, created_at, updated_at, ga_client_id, ga_session_id
)
SELECT
  id, number, access_key_hash, status, payment_method, payment_reference, currency, locale, prices_include_tax, subtotal_minor,
  tax_minor, shipping_minor, total_minor, customer_name, customer_email, customer_phone, whatsapp_opt_in, marketing_consent,
  billing_json, shipping_method_id, shipping_method_name, shipping_address_json, customer_note, tracking_code, attribution_json,
  stock_released, expires_at, paid_at, created_at, updated_at, ga_client_id, ga_session_id
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_payment_ref ON orders(payment_method, payment_reference);
CREATE INDEX idx_orders_expiry ON orders(status, expires_at);
CREATE INDEX idx_orders_email ON orders(customer_email);

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  variant_label TEXT NOT NULL DEFAULT '',
  sku TEXT,
  image_media_id TEXT,
  unit_price_minor INTEGER NOT NULL,
  unit_cost_minor INTEGER,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_minor INTEGER NOT NULL,
  tax_rate_bp INTEGER NOT NULL,
  tax_minor INTEGER NOT NULL,
  stock_tracked INTEGER NOT NULL
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  series TEXT NOT NULL,
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('issued', 'void')),
  currency TEXT NOT NULL,
  locale TEXT NOT NULL,
  prices_include_tax INTEGER NOT NULL,
  subtotal_minor INTEGER NOT NULL,
  tax_minor INTEGER NOT NULL,
  shipping_minor INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  seller_json TEXT NOT NULL,
  buyer_json TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  tax_breakdown_json TEXT NOT NULL,
  pdf_key TEXT,
  legal_provider TEXT,
  legal_reference TEXT,
  legal_status TEXT NOT NULL DEFAULT 'not_applicable' CHECK (legal_status IN ('not_applicable', 'pending', 'accepted', 'rejected')),
  legal_message TEXT,
  void_reason TEXT,
  issued_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (series, number)
);
CREATE INDEX idx_invoices_issued ON invoices(issued_at DESC);

INSERT INTO order_items SELECT * FROM _order_items_copy;
INSERT INTO order_events SELECT * FROM _order_events_copy;
INSERT INTO invoices SELECT * FROM _invoices_copy;
DROP TABLE _order_items_copy;
DROP TABLE _order_events_copy;
DROP TABLE _invoices_copy;
