-- Development seed for a fresh local database (run after migrations): settings, catalog and initial stock.
-- Prices are USD minor units (cents). Two apparel products have variants (Size x Color); the others are simple.
-- Stock values create "initial" inventory ledger rows so the ledger matches the current stock from day one.

-- Settings (validated by the zod schemas in application/content/settings-schemas.ts).
INSERT INTO settings (group_key, value_json, updated_at) VALUES
('general', '{"storeName":"Demo Store","logoMediaId":null,"faviconMediaId":null,"defaultLocale":"es","currency":"USD","country":"CO","timezone":"America/Bogota"}', '2026-10-21T00:00:00Z'),
('contact', '{"email":"hola@example.com","phone":"+57 300 000 0000","whatsappNumber":"573000000000","whatsappMessage":{"es":"Hola, quiero información sobre mi pedido.","en":"Hi, I would like information about my order."},"showWhatsappFloat":true,"address":"Calle 1 # 2-3, Bogotá","mapsEmbedUrl":"","openingHours":{"es":"Lunes a sábado, 9:00 a 18:00","en":"Monday to Saturday, 9:00 to 18:00"},"social":{}}', '2026-10-21T00:00:00Z'),
('tax', '{"pricesIncludeTax":true,"defaultRateBp":1900,"label":{"es":"IVA","en":"VAT"},"taxShipping":false,"showBreakdown":true}', '2026-10-21T00:00:00Z'),
('checkout', '{"enabledMethods":["dlocalgo","paypal","whatsapp","bank_transfer","cash_on_delivery"],"bankTransferInstructions":{"es":"Banco Demo, cuenta de ahorros 000-000000-00, a nombre de Demo Store SAS.","en":"Demo Bank, savings account 000-000000-00, in the name of Demo Store SAS."},"cashOnDeliveryNote":{"es":"Paga en efectivo o con tarjeta al recibir.","en":"Pay in cash or by card on delivery."},"onlineHoldMinutes":45,"manualAutoCancelDays":0,"paypalSettlementCurrency":null,"paypalExchangeRate":null,"orderNotificationEmail":"orders@example.com","whatsappOptInDefault":false}', '2026-10-21T00:00:00Z'),
('invoicing', '{"enabled":true,"autoIssue":"on_paid","series":"FV","legalName":"Demo Store SAS","taxId":"900000000-0","taxIdType":"NIT","taxRegime":"Régimen común","address":"Calle 1 # 2-3, Bogotá","phone":"+57 300 000 0000","email":"facturacion@example.com","footerNotes":{"es":"Gracias por tu compra.","en":"Thank you for your purchase."},"attachPdf":true,"askBuyerTaxId":true,"sendPdfByWhatsapp":true}', '2026-10-21T00:00:00Z'),
('catalog', '{"pageSize":24,"newDays":30,"defaultSort":"featured","showOutOfStock":"last","showStockOnProduct":"low","lowStockDisplayThreshold":5}', '2026-10-21T00:00:00Z'),
('inventory', '{"defaultLowStockThreshold":3,"lowStockAlerts":true,"lowStockAlertChannels":["email","whatsapp"],"backInStockEnabled":true}', '2026-10-21T00:00:00Z');

-- Attributes and values: Size and Color are filterable; Color uses swatches.
INSERT INTO attributes (id, code, name_json, display, is_filterable, position) VALUES
('attr-size', 'size', '{"es":"Talla","en":"Size"}', 'buttons', 1, 1),
('attr-color', 'color', '{"es":"Color","en":"Color"}', 'swatches', 1, 2);

INSERT INTO attribute_values (id, attribute_id, code, label_json, color_hex, position) VALUES
('val-size-s', 'attr-size', 's', '{"es":"S","en":"S"}', NULL, 1),
('val-size-m', 'attr-size', 'm', '{"es":"M","en":"M"}', NULL, 2),
('val-size-l', 'attr-size', 'l', '{"es":"L","en":"L"}', NULL, 3),
('val-color-black', 'attr-color', 'black', '{"es":"Negro","en":"Black"}', '#111111', 1),
('val-color-white', 'attr-color', 'white', '{"es":"Blanco","en":"White"}', '#ffffff', 2),
('val-color-red', 'attr-color', 'red', '{"es":"Rojo","en":"Red"}', '#d62828', 3),
('val-color-blue', 'attr-color', 'blue', '{"es":"Azul","en":"Blue"}', '#1d4ed8', 4);

-- Categories with translations.
INSERT INTO categories (id, parent_id, image_media_id, position, is_active, created_at, updated_at) VALUES
('cat-tees', NULL, NULL, 1, 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
('cat-acc', NULL, NULL, 2, 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z'),
('cat-home', NULL, NULL, 3, 1, '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z');

INSERT INTO category_translations (category_id, locale, name, slug, description) VALUES
('cat-tees', 'es', 'Camisetas', 'camisetas', 'Camisetas y buzos de algodón'),
('cat-tees', 'en', 'Apparel', 'apparel', 'Cotton t-shirts and sweatshirts'),
('cat-acc', 'es', 'Accesorios', 'accesorios', 'Gorras, botellas y bolsos'),
('cat-acc', 'en', 'Accessories', 'accessories', 'Caps, bottles and bags'),
('cat-home', 'es', 'Hogar', 'hogar', 'Para tu casa y tu escritorio'),
('cat-home', 'en', 'Home', 'home', 'For your home and desk');

-- Products (12). Names, slugs and descriptions are in product_translations.
INSERT INTO products (id, status, base_price_minor, compare_at_price_minor, tax_rate_bp, min_price_minor, max_price_minor, is_on_sale, is_featured, sales_count, created_at, updated_at) VALUES
('prod-tee', 'active', 2500, 3000, NULL, 2500, 2500, 1, 1, 12, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'),
('prod-hoodie', 'active', 4500, NULL, NULL, 4500, 4500, 0, 1, 5, '2026-09-20T10:00:00Z', '2026-09-20T10:00:00Z'),
('prod-cap', 'active', 1500, NULL, NULL, 1500, 1500, 0, 0, 3, '2026-10-15T10:00:00Z', '2026-10-15T10:00:00Z'),
('prod-bottle', 'active', 1200, NULL, NULL, 1200, 1200, 0, 1, 20, '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z'),
('prod-mug', 'active', 900, NULL, NULL, 900, 900, 0, 0, 7, '2026-08-15T10:00:00Z', '2026-08-15T10:00:00Z'),
('prod-candle', 'active', 1800, NULL, 0, 1800, 1800, 0, 0, 4, '2026-09-10T10:00:00Z', '2026-09-10T10:00:00Z'),
('prod-pillow', 'active', 2200, NULL, NULL, 2200, 2200, 0, 1, 9, '2026-07-20T10:00:00Z', '2026-07-20T10:00:00Z'),
('prod-tote', 'active', 1400, NULL, NULL, 1400, 1400, 0, 0, 6, '2026-08-01T10:00:00Z', '2026-08-01T10:00:00Z'),
('prod-notebook', 'active', 1000, NULL, NULL, 1000, 1000, 0, 0, 0, '2026-10-18T10:00:00Z', '2026-10-18T10:00:00Z'),
('prod-sticker', 'active', 500, NULL, NULL, 500, 500, 0, 0, 40, '2026-06-01T10:00:00Z', '2026-06-01T10:00:00Z'),
('prod-blanket', 'active', 3500, NULL, NULL, 3500, 3500, 0, 0, 2, '2026-05-01T10:00:00Z', '2026-05-01T10:00:00Z'),
('prod-plant', 'active', 2000, 2500, NULL, 2000, 2000, 1, 0, 8, '2026-09-25T10:00:00Z', '2026-09-25T10:00:00Z');

INSERT INTO product_translations (product_id, locale, name, slug, short_description, description_md, seo_title, seo_description) VALUES
('prod-tee', 'es', 'Camiseta clásica', 'camiseta-clasica', 'Algodón 100%, corte recto.', 'Camiseta de algodón 100% con corte recto y costuras reforzadas.', '', ''),
('prod-tee', 'en', 'Classic tee', 'classic-tee', '100% cotton, regular fit.', 'A 100% cotton tee with a regular fit and reinforced seams.', '', ''),
('prod-hoodie', 'es', 'Buzo con capucha', 'buzo-con-capucha', 'Felpa suave y cálida.', 'Buzo con capucha de felpa suave, ideal para días fríos.', '', ''),
('prod-hoodie', 'en', 'Hooded sweatshirt', 'hooded-sweatshirt', 'Soft, warm fleece.', 'A hooded sweatshirt in soft fleece, ideal for cold days.', '', ''),
('prod-cap', 'es', 'Gorra bordada', 'gorra-bordada', 'Ajuste regulable.', 'Gorra con bordado frontal y cierre ajustable.', '', ''),
('prod-cap', 'en', 'Embroidered cap', 'embroidered-cap', 'Adjustable fit.', 'A cap with a front embroidery and an adjustable strap.', '', ''),
('prod-bottle', 'es', 'Botella térmica', 'botella-termica', 'Mantiene la bebida fría 12 h.', 'Botella de acero inoxidable de doble pared.', '', ''),
('prod-bottle', 'en', 'Insulated bottle', 'insulated-bottle', 'Keeps drinks cold for 12 h.', 'A double-wall stainless steel bottle.', '', ''),
('prod-mug', 'es', 'Taza de cerámica', 'taza-de-ceramica', 'Apta para microondas.', 'Taza de cerámica de 350 ml, apta para microondas y lavavajillas.', '', ''),
('prod-mug', 'en', 'Ceramic mug', 'ceramic-mug', 'Microwave safe.', 'A 350 ml ceramic mug, microwave and dishwasher safe.', '', ''),
('prod-candle', 'es', 'Vela aromática', 'vela-aromatica', 'Cera de soja, 40 horas.', 'Vela de cera de soja con aroma natural. Dura unas 40 horas.', '', ''),
('prod-candle', 'en', 'Scented candle', 'scented-candle', 'Soy wax, 40 hours.', 'A soy wax candle with a natural scent. Burns for about 40 hours.', '', ''),
('prod-pillow', 'es', 'Cojín decorativo', 'cojin-decorativo', 'Funda desmontable.', 'Cojín decorativo con funda desmontable y lavable.', '', ''),
('prod-pillow', 'en', 'Decorative cushion', 'decorative-cushion', 'Removable cover.', 'A decorative cushion with a removable, washable cover.', '', ''),
('prod-tote', 'es', 'Bolso tote', 'bolso-tote', 'Lona resistente.', 'Bolso tote de lona resistente con asas reforzadas.', '', ''),
('prod-tote', 'en', 'Tote bag', 'tote-bag', 'Sturdy canvas.', 'A tote bag in sturdy canvas with reinforced handles.', '', ''),
('prod-notebook', 'es', 'Cuaderno A5', 'cuaderno-a5', '96 hojas de papel reciclado.', 'Cuaderno A5 con 96 hojas de papel reciclado.', '', ''),
('prod-notebook', 'en', 'A5 notebook', 'a5-notebook', '96 pages of recycled paper.', 'An A5 notebook with 96 pages of recycled paper.', '', ''),
('prod-sticker', 'es', 'Pack de stickers', 'pack-de-stickers', 'Diez diseños a color.', 'Pack de diez stickers a color, resistentes al agua.', '', ''),
('prod-sticker', 'en', 'Sticker pack', 'sticker-pack', 'Ten colour designs.', 'A pack of ten colour stickers, water resistant.', '', ''),
('prod-blanket', 'es', 'Manta de punto', 'manta-de-punto', 'Tejido suave para el sofá.', 'Manta de punto suave, perfecta para el sofá.', '', ''),
('prod-blanket', 'en', 'Knit blanket', 'knit-blanket', 'Soft knit for the sofa.', 'A soft knit blanket, perfect for the sofa.', '', ''),
('prod-plant', 'es', 'Planta de escritorio', 'planta-de-escritorio', 'Fácil de cuidar.', 'Planta de interior de bajo mantenimiento, en maceta de 12 cm.', '', ''),
('prod-plant', 'en', 'Desk plant', 'desk-plant', 'Easy to care for.', 'A low-maintenance indoor plant in a 12 cm pot.', '', '');

INSERT INTO product_categories (product_id, category_id) VALUES
('prod-tee', 'cat-tees'), ('prod-hoodie', 'cat-tees'),
('prod-cap', 'cat-acc'), ('prod-bottle', 'cat-acc'), ('prod-tote', 'cat-acc'), ('prod-notebook', 'cat-acc'), ('prod-sticker', 'cat-acc'),
('prod-mug', 'cat-home'), ('prod-candle', 'cat-home'), ('prod-pillow', 'cat-home'), ('prod-blanket', 'cat-home'), ('prod-plant', 'cat-home');

-- Variants. Simple products have one variant without attribute values. Apparel has Size x Color combinations.
INSERT INTO product_variants (id, product_id, sku, barcode, price_minor, compare_at_price_minor, cost_minor, stock, track_inventory, low_stock_threshold, image_media_id, position, is_active) VALUES
('var-tee-s-black', 'prod-tee', 'TEE-S-BLK', '7701000000011', NULL, NULL, 1000, 10, 1, NULL, NULL, 1, 1),
('var-tee-m-black', 'prod-tee', 'TEE-M-BLK', '7701000000028', NULL, NULL, 1000, 8, 1, NULL, NULL, 2, 1),
('var-tee-l-black', 'prod-tee', 'TEE-L-BLK', '7701000000035', NULL, NULL, 1000, 5, 1, NULL, NULL, 3, 1),
('var-tee-s-white', 'prod-tee', 'TEE-S-WHT', '7701000000042', NULL, NULL, 1000, 6, 1, NULL, NULL, 4, 1),
('var-tee-m-white', 'prod-tee', 'TEE-M-WHT', '7701000000059', NULL, NULL, 1000, 0, 1, NULL, NULL, 5, 1),
('var-tee-l-white', 'prod-tee', 'TEE-L-WHT', '7701000000066', NULL, NULL, 1000, 4, 1, NULL, NULL, 6, 1),
('var-hd-m-black', 'prod-hoodie', 'HD-M-BLK', '7701000001001', NULL, NULL, 2000, 3, 1, NULL, NULL, 1, 1),
('var-hd-l-black', 'prod-hoodie', 'HD-L-BLK', '7701000001018', NULL, NULL, 2000, 4, 1, NULL, NULL, 2, 1),
('var-hd-m-red', 'prod-hoodie', 'HD-M-RED', '7701000001025', NULL, NULL, 2000, 0, 1, NULL, NULL, 3, 1),
('var-hd-l-red', 'prod-hoodie', 'HD-L-RED', '7701000001032', NULL, NULL, 2000, 2, 1, NULL, NULL, 4, 1),
('var-cap', 'prod-cap', 'CAP-01', '7701000002008', NULL, NULL, 600, 20, 1, NULL, NULL, 1, 1),
('var-bottle', 'prod-bottle', 'BTL-01', '7701000003005', NULL, NULL, 400, 40, 1, NULL, NULL, 1, 1),
('var-mug', 'prod-mug', 'MUG-01', '7701000004002', NULL, NULL, 300, 0, 1, NULL, NULL, 1, 1),
('var-candle', 'prod-candle', 'CND-01', '7701000005009', NULL, NULL, 700, 12, 1, NULL, NULL, 1, 1),
('var-pillow', 'prod-pillow', 'PIL-01', '7701000006006', NULL, NULL, 900, 6, 1, NULL, NULL, 1, 1),
('var-tote', 'prod-tote', 'TOT-01', '7701000007003', NULL, NULL, 500, 2, 1, NULL, NULL, 1, 1),
('var-notebook', 'prod-notebook', 'NTB-01', '7701000008000', NULL, NULL, 350, 30, 1, NULL, NULL, 1, 1),
('var-sticker', 'prod-sticker', 'STK-01', '7701000009007', NULL, NULL, 80, 100, 1, NULL, NULL, 1, 1),
('var-blanket', 'prod-blanket', 'BLK-01', '7701000010003', NULL, NULL, 1700, 0, 1, NULL, NULL, 1, 1),
('var-plant', 'prod-plant', 'PLT-01', '7701000011000', NULL, NULL, 800, 9, 1, NULL, NULL, 1, 1);

INSERT INTO variant_attribute_values (variant_id, attribute_value_id) VALUES
('var-tee-s-black', 'val-size-s'), ('var-tee-s-black', 'val-color-black'),
('var-tee-m-black', 'val-size-m'), ('var-tee-m-black', 'val-color-black'),
('var-tee-l-black', 'val-size-l'), ('var-tee-l-black', 'val-color-black'),
('var-tee-s-white', 'val-size-s'), ('var-tee-s-white', 'val-color-white'),
('var-tee-m-white', 'val-size-m'), ('var-tee-m-white', 'val-color-white'),
('var-tee-l-white', 'val-size-l'), ('var-tee-l-white', 'val-color-white'),
('var-hd-m-black', 'val-size-m'), ('var-hd-m-black', 'val-color-black'),
('var-hd-l-black', 'val-size-l'), ('var-hd-l-black', 'val-color-black'),
('var-hd-m-red', 'val-size-m'), ('var-hd-m-red', 'val-color-red'),
('var-hd-l-red', 'val-size-l'), ('var-hd-l-red', 'val-color-red');

-- Full-text rows for search (one per product and language).
INSERT INTO product_search (product_id, locale, name, short_description) VALUES
('prod-tee', 'es', 'Camiseta clásica', 'Algodón 100%, corte recto.'),
('prod-tee', 'en', 'Classic tee', '100% cotton, regular fit.'),
('prod-hoodie', 'es', 'Buzo con capucha', 'Felpa suave y cálida.'),
('prod-hoodie', 'en', 'Hooded sweatshirt', 'Soft, warm fleece.'),
('prod-cap', 'es', 'Gorra bordada', 'Ajuste regulable.'),
('prod-cap', 'en', 'Embroidered cap', 'Adjustable fit.'),
('prod-bottle', 'es', 'Botella térmica', 'Mantiene la bebida fría 12 h.'),
('prod-bottle', 'en', 'Insulated bottle', 'Keeps drinks cold for 12 h.'),
('prod-mug', 'es', 'Taza de cerámica', 'Apta para microondas.'),
('prod-mug', 'en', 'Ceramic mug', 'Microwave safe.'),
('prod-candle', 'es', 'Vela aromática', 'Cera de soja, 40 horas.'),
('prod-candle', 'en', 'Scented candle', 'Soy wax, 40 hours.'),
('prod-pillow', 'es', 'Cojín decorativo', 'Funda desmontable.'),
('prod-pillow', 'en', 'Decorative cushion', 'Removable cover.'),
('prod-tote', 'es', 'Bolso tote', 'Lona resistente.'),
('prod-tote', 'en', 'Tote bag', 'Sturdy canvas.'),
('prod-notebook', 'es', 'Cuaderno A5', '96 hojas de papel reciclado.'),
('prod-notebook', 'en', 'A5 notebook', '96 pages of recycled paper.'),
('prod-sticker', 'es', 'Pack de stickers', 'Diez diseños a color.'),
('prod-sticker', 'en', 'Sticker pack', 'Ten colour designs.'),
('prod-blanket', 'es', 'Manta de punto', 'Tejido suave para el sofá.'),
('prod-blanket', 'en', 'Knit blanket', 'Soft knit for the sofa.'),
('prod-plant', 'es', 'Planta de escritorio', 'Fácil de cuidar.'),
('prod-plant', 'en', 'Desk plant', 'Easy to care for.');

-- Initial inventory ledger: one "initial" movement for every variant that starts with stock.
INSERT INTO inventory_movements (id, variant_id, product_id, delta, stock_after, reason, reference, note, actor, created_at)
SELECT 'mov-' || id, id, product_id, stock, stock, 'initial', NULL, NULL, 'system', '2026-10-21T00:00:00Z'
FROM product_variants
WHERE stock > 0;

-- Shipping methods.
INSERT INTO shipping_methods (id, kind, name_json, description_json, price_minor, free_over_minor, is_active, position) VALUES
('ship-flat', 'flat', '{"es":"Envío estándar","en":"Standard shipping"}', '{"es":"Entrega en 3 a 5 días hábiles","en":"Delivered in 3 to 5 business days"}', 800, 8000, 1, 1),
('ship-pickup', 'pickup', '{"es":"Recoger en tienda","en":"Store pickup"}', '{"es":"Sin costo, de lunes a sábado","en":"Free, Monday to Saturday"}', 0, NULL, 1, 2);
