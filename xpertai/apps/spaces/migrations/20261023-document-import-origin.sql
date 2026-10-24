-- Additive metadata only. Document bytes remain in the Project workspace.
BEGIN;
ALTER TABLE plugin_spaces_item ADD COLUMN IF NOT EXISTS "importOrigin" jsonb;
COMMIT;
