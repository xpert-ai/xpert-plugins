-- Apply before loading the durable-webhook plugin version. Existing processed receipts remain valid.
BEGIN;
ALTER TABLE plugin_code_review_delivery
  ADD COLUMN IF NOT EXISTS "repositoryPolicyId" uuid,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "retryAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "errorCode" varchar;
CREATE INDEX IF NOT EXISTS plugin_code_review_delivery_pending
  ON plugin_code_review_delivery ("repositoryPolicyId", status, "retryAt");
COMMIT;
