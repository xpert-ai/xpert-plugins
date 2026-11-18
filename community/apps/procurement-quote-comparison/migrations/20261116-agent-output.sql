ALTER TABLE plugin_procurement_delivery_check
  ADD COLUMN IF NOT EXISTS "outputBinding" uuid,
  ADD COLUMN IF NOT EXISTS "outputRevision" integer,
  ADD COLUMN IF NOT EXISTS "outputMessageId" uuid;
