-- Additive upgrade. Existing repository policies retain Project pipeline execution.
ALTER TABLE plugin_code_review_review ADD COLUMN IF NOT EXISTS "requestKey" varchar;
CREATE UNIQUE INDEX IF NOT EXISTS code_review_request_key ON plugin_code_review_review ("requestKey");
CREATE TABLE IF NOT EXISTS plugin_code_review_subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "assistantId" varchar NOT NULL,
  "userId" varchar NOT NULL, "workspaceId" varchar NOT NULL, enabled boolean NOT NULL DEFAULT false,
  instructions text NOT NULL DEFAULT '',
  "lastEventAt" timestamptz, "lastRunAt" timestamptz,
  UNIQUE ("tenantId", "organizationId", "assistantId")
);
ALTER TABLE plugin_code_review_subscription ADD COLUMN IF NOT EXISTS instructions text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS plugin_code_review_workflow_diagnosis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "assistantId" varchar NOT NULL, "userId" varchar NOT NULL,
  "repositoryPolicyId" uuid NOT NULL, "operationKey" varchar NOT NULL, "policyRevision" int NOT NULL,
  settings jsonb NOT NULL, ref jsonb NOT NULL, status varchar NOT NULL DEFAULT 'queued', reason varchar,
  evidence jsonb, result jsonb, "executionId" varchar, "conversationId" varchar, "taskId" varchar, "threadId" varchar,
  "startedAt" timestamptz, "finishedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("repositoryPolicyId", "operationKey")
);
CREATE INDEX IF NOT EXISTS code_review_workflow_owner ON plugin_code_review_workflow_diagnosis ("tenantId", "organizationId", "assistantId", "userId");
UPDATE plugin_code_review_repository SET settings = '{"executionMode":"pipeline","onWorkflowFailure":false,"onWorkflowTimeout":false,"workflows":[]}'::jsonb || settings
  WHERE NOT settings ? 'executionMode';
UPDATE plugin_code_review_run SET settings = '{"executionMode":"pipeline","onWorkflowFailure":false,"onWorkflowTimeout":false,"workflows":[]}'::jsonb || settings
  WHERE NOT settings ? 'executionMode';
