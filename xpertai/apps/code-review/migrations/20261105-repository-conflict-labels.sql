-- Enrich existing plugin audit display names without changing ownership or history.
-- Run against the Xpert host database before enabling conflict detail disclosure.
BEGIN;
UPDATE plugin_code_review_policy_audit a
SET snapshot = a.snapshot || jsonb_build_object('organizationLabel', o.name)
FROM organization o
WHERE o.id::text = a."organizationId" AND o."tenantId"::text = a."tenantId"
  AND NULLIF(a.snapshot->>'organizationLabel', '') IS NULL;

UPDATE plugin_code_review_policy_audit a
SET snapshot = a.snapshot || jsonb_build_object('actorLabel',
  COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u."firstName", u."lastName")), ''), u.username, ''))
FROM "user" u
WHERE u.id::text = a."actorId" AND u."tenantId"::text = a."tenantId"
  AND NULLIF(a.snapshot->>'actorLabel', '') IS NULL;
COMMIT;
