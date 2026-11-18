ALTER TABLE plugin_code_review_run
  ADD COLUMN IF NOT EXISTS "outputPending" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "outputMessageId" uuid;
