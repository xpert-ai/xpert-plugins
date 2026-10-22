-- Existing private reviews and unbound repository policies remain private and unbound.
-- Apply after the earlier code-review migrations, before starting the upgraded API.
BEGIN;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineContext" jsonb;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineDispatch" jsonb;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "projectShared" boolean NOT NULL DEFAULT false;
ALTER TABLE plugin_code_review_run ADD COLUMN IF NOT EXISTS "pipelineInstanceId" uuid;
ALTER TABLE plugin_code_review_run ADD COLUMN IF NOT EXISTS "pipelineRoundId" uuid;
ALTER TABLE plugin_code_review_pipeline_binding ADD COLUMN IF NOT EXISTS "sourceKey" varchar;
ALTER TABLE plugin_code_review_pipeline_binding ADD COLUMN IF NOT EXISTS "savedBindingId" uuid;
ALTER TABLE plugin_code_review_pipeline_binding ADD COLUMN IF NOT EXISTS "currentReviewId" uuid;
CREATE UNIQUE INDEX IF NOT EXISTS code_review_pipeline_subject ON plugin_code_review_pipeline_binding
  ("tenantId", "organizationId", "projectId", "sourceKey", "savedBindingId");
-- No historical snapshot is assigned to a Project or new executor by migration.
COMMIT;
