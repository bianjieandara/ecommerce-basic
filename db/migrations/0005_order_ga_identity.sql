-- Google Analytics identity of the buyer, kept on the order so the server can send the purchase to GA4 (Measurement Protocol) when the
-- payment is confirmed, and GA4 joins it to the visitor and session of the browser events. Both are NULL unless the buyer granted
-- marketing consent at checkout; no consent, no identity stored.
ALTER TABLE orders ADD COLUMN ga_client_id TEXT;
ALTER TABLE orders ADD COLUMN ga_session_id TEXT;
