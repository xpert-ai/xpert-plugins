-- Apply to existing installations before starting the upgraded plugin.
-- Never infer or backfill an App binding; the owner must revalidate the repository.
BEGIN;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "githubIntegrationId" uuid;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "githubAppId" varchar;
COMMIT;
