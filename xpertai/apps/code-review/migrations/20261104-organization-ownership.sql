-- Additive only. Historical records retain their original audience and policy identifiers.
BEGIN;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "executionRevision" integer;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS ownership varchar NOT NULL DEFAULT 'user';
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "configuredById" varchar;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "updatedById" varchar;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "responsibleUserId" varchar;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "executionGrantId" uuid;
ALTER TABLE plugin_code_review_repository ADD COLUMN IF NOT EXISTS "executionUserId" varchar;
-- Metadata synchronization may already have added executionRevision with default 1.
-- Only unadopted rows without provenance receive the one-time legacy backfill.
UPDATE plugin_code_review_repository SET "executionRevision" = revision
 WHERE "executionRevision" IS NULL OR (ownership = 'user' AND "configuredById" IS NULL AND "executionGrantId" IS NULL);
ALTER TABLE plugin_code_review_repository ALTER COLUMN "executionRevision" SET DEFAULT 1;
ALTER TABLE plugin_code_review_repository ALTER COLUMN "executionRevision" SET NOT NULL;
UPDATE plugin_code_review_repository SET "configuredById" = "userId" WHERE "configuredById" IS NULL;
ALTER TABLE plugin_code_review_run ADD COLUMN IF NOT EXISTS "evidenceUserId" varchar;
ALTER TABLE plugin_code_review_run ADD COLUMN IF NOT EXISTS "organizationShared" boolean NOT NULL DEFAULT false;
UPDATE plugin_code_review_run r SET "evidenceUserId" = p."userId"
 FROM plugin_code_review_repository p WHERE r."repositoryPolicyId" = p.id AND r."evidenceUserId" IS NULL;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "organizationShared" boolean NOT NULL DEFAULT false;
ALTER TABLE plugin_code_review_workflow_diagnosis ADD COLUMN IF NOT EXISTS "organizationShared" boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS plugin_code_review_policy_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL,
 "repositoryPolicyId" uuid NOT NULL, revision integer NOT NULL, "actorId" varchar NOT NULL,
 action varchar NOT NULL, snapshot jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
 UNIQUE ("tenantId", "organizationId", "repositoryPolicyId", revision)
);
-- Missing mode/binding and legacy delivery settings require explicit repair and adoption.
-- Never set enabled=true, rewrite run snapshots, or move private evidence into an organization.
COMMIT;
