-- Apply after the host Project type schema migration, in the same transaction.
-- Plugin scope columns can be varchar while host scope columns are uuid.
-- Uses persisted business links only. Does not update ids, files, membership or timestamps.
LOCK TABLE xpert_project IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "plugin_factory_ops_case" IN SHARE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "plugin_factory_ops_case" c JOIN xpert_project p ON p.id::text = c."workspaceProjectId"::text
    WHERE p."tenantId"::text IS DISTINCT FROM c."tenantId"::text OR p."organizationId"::text IS DISTINCT FROM c."organizationId"::text
       OR (p."applicationKey" IS NOT NULL AND (p."applicationKey" <> '@xpert-ai/plugin-factory-operations:factory-operations' OR p."projectTypeKey" <> 'case'))) THEN
    RAISE EXCEPTION 'Project type backfill: conflicting application ownership or scope';
  END IF;
END $$;
UPDATE xpert_project p SET "applicationKey" = '@xpert-ai/plugin-factory-operations:factory-operations', "projectTypeKey" = 'case',
  "projectTypeSnapshot" = '{"applicationTitle": {"en_US": "Factory Operations", "zh_Hans": "工厂运营"}, "title": {"en_US": "Case", "zh_Hans": "Case"}, "binding": {"kind": "entity", "providerKey": "factory_ops_case_project"}}'::jsonb,
  "applicationInstallationId" = (SELECT i.id FROM plugin_application_installation i
    WHERE i."tenantId" = p."tenantId" AND i."organizationId" IS NOT DISTINCT FROM p."organizationId"
      AND i."pluginName" = '@xpert-ai/plugin-factory-operations' AND i."appName" = 'factory-operations')
FROM "plugin_factory_ops_case" c
WHERE p.id::text = c."workspaceProjectId"::text AND p."applicationKey" IS NULL AND p."projectTypeKey" IS NULL
  AND p."tenantId"::text = c."tenantId"::text AND p."organizationId"::text IS NOT DISTINCT FROM c."organizationId"::text;
