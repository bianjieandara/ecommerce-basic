-- 0001_initial: full schema for one store. Every table is documented in docs/ARCHITECTURE.md and the plan.
-- Money columns are integer minor units (*_minor); tax rates are basis points; booleans are INTEGER 0/1.

-- Settings: one row per settings group; the value is validated by zod in application/content/settings-schemas.ts.
CREATE TABLE settings (
  group_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Admin identity: owners and editors who log in to /admin.
CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  locale TEXT NOT NULL DEFAULT 'es',
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Admin sessions: only the SHA-256 of the cookie token is stored.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions(user_id);

-- Password reset tokens (hashed, single use, short lived).
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

-- Media metadata. The files live in R2; variants_json = [{"width":480,"key":"media/<id>/480.webp","bytes":12345}].
CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  variants_json TEXT NOT NULL,
  alt_json TEXT NOT NULL DEFAULT '{}',
  bytes_total INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_media_created ON media_assets(created_at DESC);

-- Categories: language-independent structure; names and slugs live in category_translations.
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE category_translations (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (category_id, locale),
  UNIQUE (locale, slug)
);

-- Attributes (Size, Color...) and their values. Used for variants and for storefront filters.
CREATE TABLE attributes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name_json TEXT NOT NULL,
  display TEXT NOT NULL DEFAULT 'buttons' CHECK (display IN ('buttons', 'swatches')),
  is_filterable INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE attribute_values (
  id TEXT PRIMARY KEY,
  attribute_id TEXT NOT NULL REFERENCES attributes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label_json TEXT NOT NULL,
  color_hex TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (attribute_id, code)
);

-- Products: language-independent price and status; names and slugs live in product_translations.
-- min/max_price_minor and is_on_sale are denormalized on save so listings never compute them per row.
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  base_price_minor INTEGER NOT NULL CHECK (base_price_minor >= 0),
  compare_at_price_minor INTEGER CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor >= 0),
  tax_rate_bp INTEGER CHECK (tax_rate_bp IS NULL OR tax_rate_bp BETWEEN 0 AND 10000),
  min_price_minor INTEGER NOT NULL,
  max_price_minor INTEGER NOT NULL,
  is_on_sale INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  sales_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_products_listing ON products(status, created_at DESC);
CREATE INDEX idx_products_price ON products(status, min_price_minor);
CREATE INDEX idx_products_featured ON products(status, is_featured);
CREATE TABLE product_translations (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  short_description TEXT NOT NULL DEFAULT '',
  description_md TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, locale),
  UNIQUE (locale, slug)
);
CREATE TABLE product_categories (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);
CREATE TABLE product_images (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (product_id, media_id)
);

-- Variants: the sellable unit. A simple product has exactly one variant with no attribute values.
-- The CHECK on stock is the last line of defence against overselling.
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  barcode TEXT,
  price_minor INTEGER CHECK (price_minor IS NULL OR price_minor >= 0),
  compare_at_price_minor INTEGER,
  cost_minor INTEGER CHECK (cost_minor IS NULL OR cost_minor >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  track_inventory INTEGER NOT NULL DEFAULT 1,
  low_stock_threshold INTEGER,
  image_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_barcode ON product_variants(barcode);
CREATE TABLE variant_attribute_values (
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  attribute_value_id TEXT NOT NULL REFERENCES attribute_values(id) ON DELETE RESTRICT,
  PRIMARY KEY (variant_id, attribute_value_id)
);
CREATE INDEX idx_vav_value ON variant_attribute_values(attribute_value_id);

-- Full-text search over product names and short descriptions (prefix queries from the search box).
CREATE VIRTUAL TABLE product_search USING fts5(
  product_id UNINDEXED,
  locale UNINDEXED,
  name,
  short_description,
  tokenize = 'unicode61 remove_diacritics 2'
);

-- Inventory ledger: append-only record of every stock change. Written in the same batch as the stock update.
CREATE TABLE inventory_movements (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('initial', 'sale', 'cancel_restore', 'restock', 'manual_adjust', 'return', 'damage', 'import')),
  reference TEXT,
  note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_inv_mov_variant ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX idx_inv_mov_created ON inventory_movements(created_at DESC);

-- "Notify me when it is back in stock" subscriptions. One per variant and email.
CREATE TABLE stock_subscriptions (
  id TEXT PRIMARY KEY,
  variant_id TEXT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  locale TEXT NOT NULL,
  whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  notified_at TEXT,
  UNIQUE (variant_id, email)
);

-- Shipping methods. "flat" charges price_minor (free above free_over_minor); "pickup" is free.
CREATE TABLE shipping_methods (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('flat', 'pickup')),
  name_json TEXT NOT NULL,
  description_json TEXT NOT NULL DEFAULT '{}',
  price_minor INTEGER NOT NULL DEFAULT 0,
  free_over_minor INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0
);

-- Order numbers come from this single-row counter, incremented inside the order batch.
CREATE TABLE order_counter (id INTEGER PRIMARY KEY CHECK (id = 1), last_number INTEGER NOT NULL);
INSERT INTO order_counter (id, last_number) VALUES (1, 1000);

-- Orders: snapshots of prices, tax and customer data, so history never changes when the catalog does.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  number INTEGER NOT NULL UNIQUE,
  access_key_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'paypal', 'whatsapp', 'bank_transfer', 'cash_on_delivery')),
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
  updated_at TEXT NOT NULL
);
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

-- Order timeline. actor is 'system' | 'customer' | an admin user id | 'stripe' | 'paypal'.
CREATE TABLE order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  note TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_order_events_order ON order_events(order_id, created_at);

-- Webhook idempotency: a (provider, event id) pair is processed once.
CREATE TABLE payment_events (
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  received_at TEXT NOT NULL,
  PRIMARY KEY (provider, event_id)
);

-- Invoice numbering: one counter per series (for example "FV").
CREATE TABLE invoice_counters (
  series TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL
);

-- Invoices: immutable snapshots of seller, buyer, lines and tax. One invoice per order.
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

-- Email templates: admin overrides only. A missing row means the code default is used.
CREATE TABLE email_templates (
  key TEXT PRIMARY KEY,
  subject_json TEXT NOT NULL,
  body_json TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- WhatsApp templates: maps our notification keys to Meta-approved message templates.
CREATE TABLE whatsapp_templates (
  key TEXT PRIMARY KEY,
  meta_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 0,
  body_json TEXT NOT NULL,
  params_json TEXT NOT NULL,
  button_param_path TEXT,
  header_document INTEGER NOT NULL DEFAULT 0,
  remote_status_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

-- Notification log: every email and WhatsApp message, queued through sent, delivered, read or failed.
CREATE TABLE notification_log (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  template_key TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  provider_message_id TEXT,
  error TEXT,
  order_id TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notification_log_created ON notification_log(created_at DESC);
CREATE INDEX idx_notification_log_order ON notification_log(order_id);
CREATE INDEX idx_notification_log_provider ON notification_log(provider_message_id);

-- Jobs that exhausted their retries, written by the dead-letter consumer. Retry or discard from /admin/jobs.
CREATE TABLE failed_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error TEXT,
  attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT CHECK (resolution IN ('retried', 'discarded'))
);
CREATE INDEX idx_failed_jobs_created ON failed_jobs(created_at DESC);

-- Daily rollup from Analytics Engine and orders. Kept forever, so long reports stay fast.
CREATE TABLE daily_metrics (
  day TEXT PRIMARY KEY,
  page_views INTEGER NOT NULL DEFAULT 0,
  product_views INTEGER NOT NULL DEFAULT 0,
  add_to_carts INTEGER NOT NULL DEFAULT 0,
  checkouts_started INTEGER NOT NULL DEFAULT 0,
  orders_placed INTEGER NOT NULL DEFAULT 0,
  orders_paid INTEGER NOT NULL DEFAULT 0,
  revenue_minor INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Pages: system pages (home, about, contact, privacy, terms, shipping-returns) and custom pages.
CREATE TABLE pages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('system', 'custom')),
  title_json TEXT NOT NULL,
  seo_title_json TEXT NOT NULL DEFAULT '{}',
  seo_description_json TEXT NOT NULL DEFAULT '{}',
  sections_json TEXT NOT NULL DEFAULT '[]',
  is_published INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

-- Testimonials shown in the testimonials widget and merged with Google reviews.
CREATE TABLE testimonials (
  id TEXT PRIMARY KEY,
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  locale TEXT NOT NULL,
  avatar_media_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
  is_visible INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Messages from the contact form.
CREATE TABLE contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  message TEXT NOT NULL,
  locale TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_contact_messages_created ON contact_messages(created_at DESC);
