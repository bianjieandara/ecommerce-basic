-- Index for the inventory list when it is sorted by stock. The list shows active variants only, so the index covers only those.
-- Ascending uses it as it is; descending reads it backwards (the descending sort reverses every column). Sorting by name or by
-- value still reads all active variants, because those keys are computed per row.
CREATE INDEX IF NOT EXISTS idx_variants_active_stock ON product_variants (stock, product_id, position, id) WHERE is_active = 1;
