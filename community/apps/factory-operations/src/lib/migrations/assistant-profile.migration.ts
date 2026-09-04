import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

/** Additive, idempotent plugin-owned migration. The existing Case/Audit/Project tables are preserved. */
@Injectable()
export class FactoryProfileMigration {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async ensure() {
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('factory_ops.assistant_profile.v1'))")
      await manager.query(`CREATE TABLE IF NOT EXISTS plugin_factory_ops_schema_version (
        version varchar(100) PRIMARY KEY, "appliedAt" timestamptz NOT NULL DEFAULT now()
      )`)
      const applied: { version: string }[] = await manager.query("SELECT version FROM plugin_factory_ops_schema_version WHERE version = 'assistant-profile-v1'")
      if (applied.length) return
      await manager.query(`ALTER TABLE plugin_factory_ops_case
        ADD COLUMN IF NOT EXISTS "coordinatorXpertId" varchar NULL,
        ADD COLUMN IF NOT EXISTS "assignedAssistantIds" jsonb NOT NULL DEFAULT '[]'::jsonb`)
      await manager.query(`CREATE TABLE IF NOT EXISTS plugin_factory_ops_continuation (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" varchar NOT NULL, "organizationId" varchar NULL, "scopeKey" varchar(180) NOT NULL,
        "installationScopeKey" varchar(180) NOT NULL, "caseId" uuid NOT NULL, "operationId" varchar(128) NOT NULL,
        "executionOperationId" varchar(128) NOT NULL, "verificationOperationId" varchar(128) NULL,
        "actorId" varchar NOT NULL, "coordinatorXpertId" varchar NULL,
        "approvedRevision" int NOT NULL, "expectedRevision" int NOT NULL, "planRevision" int NOT NULL,
        status varchar(24) NOT NULL DEFAULT 'pending', step varchar(24) NOT NULL DEFAULT 'execute',
        "reasonCode" varchar(128) NULL, "verificationRecordId" uuid NULL, "verificationAttempt" int NOT NULL DEFAULT 0,
        generation int NOT NULL DEFAULT 0, failures int NOT NULL DEFAULT 0, "leaseToken" uuid NULL, "leaseUntil" timestamptz NULL,
        "availableAt" timestamptz NOT NULL DEFAULT now(), "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`)
      await manager.query('CREATE UNIQUE INDEX IF NOT EXISTS factory_ops_continuation_operation ON plugin_factory_ops_continuation ("scopeKey", "operationId")')
      await manager.query('CREATE UNIQUE INDEX IF NOT EXISTS factory_ops_continuation_approval ON plugin_factory_ops_continuation ("caseId", "approvedRevision")')
      await manager.query('CREATE INDEX IF NOT EXISTS factory_ops_continuation_outbox ON plugin_factory_ops_continuation ("installationScopeKey", status, "availableAt")')
      await manager.query('CREATE INDEX IF NOT EXISTS factory_ops_case_assignments ON plugin_factory_ops_case USING gin ("assignedAssistantIds")')
      // Requester records are explicit coordinator identities. Ambiguous history stays unbound.
      await manager.query(`UPDATE plugin_factory_ops_case AS c SET "coordinatorXpertId" = history.requester
        FROM (SELECT "caseId", "tenantId", "organizationId", min("requesterXpertId") AS requester
          FROM plugin_factory_ops_execution_record WHERE "requesterXpertId" IS NOT NULL AND "requesterXpertId" <> ''
          GROUP BY "caseId", "tenantId", "organizationId" HAVING count(DISTINCT "requesterXpertId") = 1) AS history
        WHERE c.id = history."caseId" AND c."tenantId" = history."tenantId"
          AND c."organizationId" IS NOT DISTINCT FROM history."organizationId" AND c."coordinatorXpertId" IS NULL`)
      await manager.query("INSERT INTO plugin_factory_ops_schema_version (version) VALUES ('assistant-profile-v1')")
    })
  }
}
