-- The proof of payment a buyer uploads for an order paid by hand (a bank transfer, a Deuna! wallet payment). The bytes live
-- in R2 under this key; only the column is here, so a receipt replaced by a second upload leaves no row behind.
-- Both are NULL until the buyer uploads something.
ALTER TABLE orders ADD COLUMN payment_receipt_key TEXT;
ALTER TABLE orders ADD COLUMN payment_receipt_at TEXT;
