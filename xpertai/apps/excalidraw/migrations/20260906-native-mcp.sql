-- Additive migration for existing installations with synchronize=false.
-- Run in the target Xpert database before loading Excalidraw 0.13.0.
BEGIN;
ALTER TABLE plugin_excalidraw_drawing_version ADD COLUMN IF NOT EXISTS "isCheckpoint" boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS plugin_excalidraw_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "actorId" varchar NOT NULL,
  "operationId" varchar(100) NOT NULL, tool varchar NOT NULL, "inputHash" varchar(64) NOT NULL,
  result jsonb, "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "organizationId", "actorId", "operationId")
);
CREATE TABLE IF NOT EXISTS plugin_excalidraw_render_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar NOT NULL, "organizationId" varchar NOT NULL, "actorId" varchar NOT NULL,
  "userId" varchar NOT NULL, "drawingId" varchar NOT NULL, "cacheKey" varchar(64) NOT NULL,
  kind varchar NOT NULL, format varchar NOT NULL, status varchar NOT NULL DEFAULT 'queued',
  "sceneRevision" integer NOT NULL, "irRevision" integer,
  "inputReference" jsonb, "inputHash" varchar, "inputSize" integer,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb, "queueJobId" varchar, "errorCode" varchar, "qualityRunId" varchar,
  "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "organizationId", "actorId", "cacheKey")
);
COMMIT;
