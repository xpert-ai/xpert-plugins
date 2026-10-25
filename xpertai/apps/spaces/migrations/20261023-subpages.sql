-- Additive migration. Logical page ancestry does not replace file-folder parentId or project ACLs.
BEGIN;
ALTER TABLE plugin_spaces_item ADD COLUMN IF NOT EXISTS "parentPageId" uuid;
ALTER TABLE plugin_spaces_item ADD COLUMN IF NOT EXISTS "childRequestTitle" varchar(200);
CREATE INDEX IF NOT EXISTS "IDX_space_page_parent" ON plugin_spaces_item ("tenantId", "organizationId", "spaceId", "parentPageId");
COMMIT;
