BEGIN;

ALTER TABLE "plugin_xpert_quotation_line"
  ADD COLUMN IF NOT EXISTS "aiRecommendedSourceUnitPrice" varchar NULL,
  ADD COLUMN IF NOT EXISTS "aiUnitConversion" jsonb NULL;

ALTER TABLE "plugin_xpert_quotation_quota_item"
  ADD COLUMN IF NOT EXISTS "formulas" jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Versions before 0.10 inferred materialReferenceOnly from bill text. That
-- flag is no longer authoritative: every bill is priced through quota
-- resources, so clear the historical false-positive marker on upgrade.
UPDATE "plugin_xpert_quotation_line"
SET "materialReferenceOnly" = false
WHERE "kind" = 'bill' AND "materialReferenceOnly" = true;

COMMIT;
