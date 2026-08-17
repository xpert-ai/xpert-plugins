BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE "plugin_xpert_quotation_quotation"
  ADD COLUMN IF NOT EXISTS "quotaSourceVersionId" uuid NULL;

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_knowledge_source" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceKey" varchar(128) NOT NULL,
  "displayName" varchar(260) NOT NULL,
  "kind" varchar(80) NOT NULL DEFAULT 'quota_pdf',
  "activeVersionId" uuid NULL,
  "currentVersionNumber" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 1,
  "createdById" varchar NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_source_scope_key" UNIQUE ("tenantId", "scopeKey", "sourceKey")
);
CREATE INDEX IF NOT EXISTS "ix_xq_source_updated" ON "plugin_xpert_quotation_knowledge_source" ("tenantId", "scopeKey", "updatedAt");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_knowledge_source_version" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceId" uuid NOT NULL,
  "versionNumber" integer NOT NULL,
  "originalFileName" varchar(260) NOT NULL,
  "mimeType" varchar(160) NOT NULL,
  "size" integer NOT NULL,
  "sha256" varchar(64) NOT NULL,
  "parserVersion" varchar(40) NOT NULL,
  "workspaceCatalog" varchar(32) NOT NULL,
  "workspaceScopeId" varchar NOT NULL,
  "workspaceFilePath" text NOT NULL,
  "workspacePath" text NULL,
  "status" varchar NOT NULL DEFAULT 'draft',
  "pageCount" integer NOT NULL DEFAULT 0,
  "quotaItemCount" integer NOT NULL DEFAULT 0,
  "resourceCount" integer NOT NULL DEFAULT 0,
  "warningCount" integer NOT NULL DEFAULT 0,
  "readyCount" integer NOT NULL DEFAULT 0,
  "reviewRequiredCount" integer NOT NULL DEFAULT 0,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "revision" integer NOT NULL DEFAULT 1,
  "publishedAt" timestamptz NULL,
  "publishedById" varchar NULL,
  "createdById" varchar NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_source_version" UNIQUE ("tenantId", "scopeKey", "sourceId", "versionNumber")
);
CREATE INDEX IF NOT EXISTS "ix_xq_version_hash" ON "plugin_xpert_quotation_knowledge_source_version" ("tenantId", "scopeKey", "sha256");
CREATE INDEX IF NOT EXISTS "ix_xq_version_status" ON "plugin_xpert_quotation_knowledge_source_version" ("tenantId", "scopeKey", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_ingestion_job" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceId" uuid NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "queueJobId" varchar(160) NOT NULL UNIQUE,
  "status" varchar NOT NULL DEFAULT 'queued',
  "stage" varchar(80) NOT NULL DEFAULT 'queued',
  "progress" integer NOT NULL DEFAULT 0,
  "currentPage" integer NOT NULL DEFAULT 0,
  "totalPages" integer NOT NULL DEFAULT 0,
  "itemCount" integer NOT NULL DEFAULT 0,
  "resourceCount" integer NOT NULL DEFAULT 0,
  "warningCount" integer NOT NULL DEFAULT 0,
  "errorCode" varchar(100) NULL,
  "errorMessage" text NULL,
  "attempt" integer NOT NULL DEFAULT 0,
  "startedAt" timestamptz NULL,
  "finishedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_ingestion_version" UNIQUE ("tenantId", "scopeKey", "sourceVersionId")
);
CREATE INDEX IF NOT EXISTS "ix_xq_ingestion_status" ON "plugin_xpert_quotation_ingestion_job" ("tenantId", "scopeKey", "status", "updatedAt");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_quota_item" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceId" uuid NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "quotaCode" varchar(40) NOT NULL,
  "quotaName" varchar(500) NOT NULL,
  "quotaUnit" varchar(80) NOT NULL,
  "chapter" varchar(500) NULL,
  "sectionCode" varchar(80) NULL,
  "sectionTitle" varchar(500) NULL,
  "workContents" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "adjustments" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "reviewStatus" varchar NOT NULL DEFAULT 'unreviewed',
  "ingestionReady" boolean NOT NULL DEFAULT false,
  "contentHash" varchar(64) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "reviewedAt" timestamptz NULL,
  "reviewedById" varchar NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_quota_code_version" UNIQUE ("tenantId", "scopeKey", "sourceVersionId", "quotaCode")
);
CREATE INDEX IF NOT EXISTS "ix_xq_quota_review" ON "plugin_xpert_quotation_quota_item" ("tenantId", "scopeKey", "sourceVersionId", "reviewStatus", "ingestionReady");
CREATE INDEX IF NOT EXISTS "ix_xq_quota_code" ON "plugin_xpert_quotation_quota_item" ("tenantId", "scopeKey", "quotaCode");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_quota_resource" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "quotaItemId" uuid NOT NULL,
  "position" integer NOT NULL,
  "category" varchar(40) NOT NULL,
  "resourceCode" varchar(80) NOT NULL,
  "resourceName" varchar(500) NOT NULL,
  "unit" varchar(80) NOT NULL,
  "consumption" numeric(24,8) NULL,
  "originalConsumption" varchar(120) NOT NULL,
  "consumptionKind" varchar(40) NOT NULL DEFAULT 'quantity',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_resource_position" UNIQUE ("tenantId", "scopeKey", "quotaItemId", "position")
);
CREATE INDEX IF NOT EXISTS "ix_xq_resource_code" ON "plugin_xpert_quotation_quota_resource" ("tenantId", "scopeKey", "sourceVersionId", "resourceCode");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_quota_evidence" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "quotaItemId" uuid NOT NULL,
  "pdfPages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "printedPages" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "excerpt" text NOT NULL,
  "sourceSha256" varchar(64) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_evidence_item" UNIQUE ("tenantId", "scopeKey", "quotaItemId")
);

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_quota_review" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "quotaItemId" uuid NOT NULL,
  "decision" varchar NOT NULL,
  "comment" text NOT NULL,
  "baseRevision" integer NOT NULL,
  "resultingRevision" integer NOT NULL,
  "reviewerId" varchar NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_xq_review_item" ON "plugin_xpert_quotation_quota_review" ("tenantId", "scopeKey", "quotaItemId", "createdAt");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_knowledge_sync" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "quotaItemId" uuid NOT NULL,
  "knowledgebaseId" varchar NOT NULL,
  "writeKey" varchar(500) NOT NULL,
  "chunkId" varchar NULL,
  "contentHash" varchar(64) NOT NULL,
  "status" varchar NOT NULL DEFAULT 'pending',
  "errorMessage" text NULL,
  "syncedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_xq_sync_item_kb" UNIQUE ("tenantId", "scopeKey", "sourceVersionId", "quotaItemId", "knowledgebaseId")
);
CREATE INDEX IF NOT EXISTS "ix_xq_sync_status" ON "plugin_xpert_quotation_knowledge_sync" ("tenantId", "scopeKey", "knowledgebaseId", "status");

CREATE TABLE IF NOT EXISTS "plugin_xpert_quotation_knowledge_sync_job" (
  "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  "tenantId" varchar NOT NULL,
  "organizationId" varchar NULL,
  "scopeKey" varchar(128) NOT NULL,
  "sourceVersionId" uuid NOT NULL,
  "knowledgebaseId" varchar NOT NULL,
  "queueJobId" varchar(160) NOT NULL UNIQUE,
  "status" varchar NOT NULL DEFAULT 'queued',
  "stage" varchar(80) NOT NULL DEFAULT 'queued',
  "progress" integer NOT NULL DEFAULT 0,
  "total" integer NOT NULL DEFAULT 0,
  "processed" integer NOT NULL DEFAULT 0,
  "synced" integer NOT NULL DEFAULT 0,
  "skipped" integer NOT NULL DEFAULT 0,
  "failed" integer NOT NULL DEFAULT 0,
  "attempt" integer NOT NULL DEFAULT 0,
  "errorCode" varchar(100) NULL,
  "errorMessage" text NULL,
  "createdById" varchar NULL,
  "startedAt" timestamptz NULL,
  "finishedAt" timestamptz NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ix_xq_sync_job_target" ON "plugin_xpert_quotation_knowledge_sync_job" ("tenantId", "scopeKey", "sourceVersionId", "knowledgebaseId", "updatedAt");
CREATE INDEX IF NOT EXISTS "ix_xq_sync_job_status" ON "plugin_xpert_quotation_knowledge_sync_job" ("tenantId", "scopeKey", "status", "updatedAt");

COMMIT;
