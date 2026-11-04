-- Legacy policies require an authenticated Assistant binding before resuming.
-- Preserve business IDs, configuring users, run snapshots and all external delivery receipts.
BEGIN;
UPDATE plugin_code_review_repository
 SET settings = jsonb_set(settings, '{enabled}', 'false'::jsonb), "executionUserId" = NULL,
     "errorCode" = 'assistant_binding_required', "executionRevision" = "executionRevision" + 1,
     revision = revision + 1
 WHERE ownership <> 'assistant' AND "errorCode" IS DISTINCT FROM 'assistant_binding_required';
-- The old reference remains in immutable policy audit snapshots and the retired host grant table.
ALTER TABLE plugin_code_review_repository DROP COLUMN IF EXISTS "executionGrantId";
COMMIT;
