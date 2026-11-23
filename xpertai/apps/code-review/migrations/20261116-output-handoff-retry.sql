ALTER TABLE plugin_code_review_run
  ADD COLUMN IF NOT EXISTS "outputAvailableAt" timestamptz DEFAULT 'epoch';
