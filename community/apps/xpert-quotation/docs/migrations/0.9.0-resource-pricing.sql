BEGIN;

ALTER TABLE "plugin_xpert_quotation_line"
  ADD COLUMN IF NOT EXISTS "quotaPricingResources" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "quotaResourcePrices" jsonb NULL,
  ADD COLUMN IF NOT EXISTS "pricingCalculation" jsonb NULL;

COMMIT;
