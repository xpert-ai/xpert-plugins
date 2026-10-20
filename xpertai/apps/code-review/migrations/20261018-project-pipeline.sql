-- Apply after schema sync and before API startup; repairs constraints on ORM-created tables.
BEGIN;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "localSources" jsonb;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineProjectId" uuid;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineRootReviewId" uuid;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineOperationId" uuid;
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "pipelineInput" jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS code_review_pipeline_operation ON plugin_code_review_review ("pipelineOperationId");
CREATE TABLE IF NOT EXISTS plugin_code_review_pipeline_binding (
  id uuid PRIMARY KEY, "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "userId" varchar NOT NULL,
  "projectId" uuid NOT NULL, "assistantId" varchar NOT NULL, "workspaceId" varchar NOT NULL,
  "instanceId" uuid, "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT code_review_pipeline_binding_identity UNIQUE (id, "tenantId", "organizationId", "projectId", "userId")
);
CREATE INDEX IF NOT EXISTS code_review_pipeline_binding_scope ON plugin_code_review_pipeline_binding ("tenantId", "organizationId", "projectId", "userId");
CREATE TABLE IF NOT EXISTS plugin_code_review_pipeline_evidence (
  id uuid PRIMARY KEY, "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "userId" varchar NOT NULL,
  "projectId" uuid NOT NULL, "reviewId" uuid NOT NULL, "operationId" uuid NOT NULL, port varchar NOT NULL,
  "schemaRef" varchar NOT NULL, digest varchar NOT NULL, content jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT code_review_pipeline_evidence_operation UNIQUE ("tenantId", "organizationId", "projectId", "operationId", port)
);
CREATE TABLE IF NOT EXISTS plugin_code_review_pipeline_delivery (
  id uuid PRIMARY KEY, "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "userId" varchar NOT NULL,
  "projectId" uuid NOT NULL, "reviewId" uuid NOT NULL, "operationId" uuid NOT NULL, "headSha" varchar NOT NULL,
  marker varchar NOT NULL, "authorId" varchar NOT NULL, body text NOT NULL,
  status varchar NOT NULL,
  receipt jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT code_review_pipeline_delivery_operation UNIQUE ("tenantId", "organizationId", "projectId", "operationId")
);

DO $migration$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('plugin_code_review_pipeline_binding', 'code_review_pipeline_binding_identity', 'UNIQUE (id, "tenantId", "organizationId", "projectId", "userId")'),
    ('plugin_code_review_pipeline_evidence', 'code_review_pipeline_evidence_operation', 'UNIQUE ("tenantId", "organizationId", "projectId", "operationId", port)'),
    ('plugin_code_review_pipeline_delivery', 'code_review_pipeline_delivery_operation', 'UNIQUE ("tenantId", "organizationId", "projectId", "operationId")'),
    ('plugin_code_review_pipeline_evidence', 'code_review_pipeline_evidence_scope', 'FOREIGN KEY ("reviewId", "tenantId", "organizationId", "projectId", "userId") REFERENCES plugin_code_review_pipeline_binding (id, "tenantId", "organizationId", "projectId", "userId")'),
    ('plugin_code_review_pipeline_delivery', 'code_review_pipeline_delivery_scope', 'FOREIGN KEY ("reviewId", "tenantId", "organizationId", "projectId", "userId") REFERENCES plugin_code_review_pipeline_binding (id, "tenantId", "organizationId", "projectId", "userId")'),
    ('plugin_code_review_pipeline_delivery', 'code_review_pipeline_delivery_status', 'CHECK (status IN (''sending'', ''unknown'', ''confirmed''))')
  ) AS checks(table_name, constraint_name, definition)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass(item.table_name) AND conname = item.constraint_name) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I %s', item.table_name, item.constraint_name, item.definition);
    END IF;
    IF item.definition NOT LIKE 'UNIQUE%' THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', item.table_name, item.constraint_name);
    END IF;
  END LOOP;
END $migration$;
COMMIT;
