// What a demo reset may write. The snapshot file names the tables it restores; only these names are accepted, so a wrong or
// hand-edited file cannot write to any other table. The list follows scripts/demo/snapshot.mjs, which a test compares with it.

/** Tables a snapshot restores, parents before children (the restore deletes them in reverse). */
export const RESTORE_TABLES = [
  'settings',
  'shipping_methods',
  'media_assets',
  'attributes',
  'attribute_values',
  'categories',
  'category_translations',
  'products',
  'product_translations',
  'product_categories',
  'product_images',
  'product_variants',
  'variant_attribute_values',
  'inventory_movements',
  'orders',
  'order_items',
  'order_events',
  'order_counter',
  'invoice_counters',
  'invoices',
  'email_templates',
  'pages',
  'testimonials',
  'daily_metrics',
] as const;

/** Visitor and log tables a reset empties before it restores (none of them is in a snapshot). */
export const VISITOR_TABLES = [
  'payment_events',
  'notification_log',
  'failed_jobs',
  'stock_subscriptions',
] as const;
