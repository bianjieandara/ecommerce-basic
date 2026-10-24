-- The contact page has no form (the owner's decision), so nothing writes to this table and no screen reads it. It was empty on
-- the live demo store. Dropping it keeps the schema honest; a form that comes back brings its own migration.
DROP INDEX IF EXISTS idx_contact_messages_created;
DROP TABLE IF EXISTS contact_messages;
