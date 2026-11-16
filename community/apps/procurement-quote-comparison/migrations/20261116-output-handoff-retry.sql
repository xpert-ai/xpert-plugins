ALTER TABLE plugin_procurement_delivery_check
  ADD COLUMN IF NOT EXISTS "outputAvailableAt" timestamptz DEFAULT 'epoch';
