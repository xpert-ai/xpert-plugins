ALTER TABLE plugin_procurement_comparison_case ADD COLUMN IF NOT EXISTS "delayDecisionsEnabled" boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS plugin_procurement_delay_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "tenantId" uuid NOT NULL, "organizationId" uuid NOT NULL,
  "caseId" uuid NOT NULL, "riskId" uuid NOT NULL, series uuid NOT NULL, revision integer NOT NULL,
  "buyerId" uuid NOT NULL, binding uuid NOT NULL, "bindingRevision" integer NOT NULL,
  supplier varchar NOT NULL, "originalDate" date NOT NULL, "revisedDate" date NOT NULL, replaces uuid,
  "conversationId" uuid, "threadId" varchar, version integer NOT NULL DEFAULT 1,
  state varchar NOT NULL DEFAULT 'pending', "decisionId" uuid, "decidedBy" uuid, "decidedAt" timestamptz,
  "outputMessageId" uuid, "availableAt" timestamptz DEFAULT now(), "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_procurement_delay_revision ON plugin_procurement_delay_decision
  ("tenantId","organizationId","caseId","riskId",series,revision);
CREATE TABLE IF NOT EXISTS plugin_procurement_delay_input (
  "tenantId" uuid NOT NULL, "organizationId" uuid NOT NULL, origin varchar NOT NULL, "commandId" uuid NOT NULL,
  "requestId" uuid NOT NULL, digest varchar NOT NULL, result jsonb NOT NULL,
  PRIMARY KEY ("tenantId","organizationId",origin,"commandId")
);
