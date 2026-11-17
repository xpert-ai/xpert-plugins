BEGIN;
ALTER TABLE plugin_code_review_delivery ADD COLUMN IF NOT EXISTS shadow jsonb;
CREATE TABLE IF NOT EXISTS plugin_code_review_event_route (
  binding uuid PRIMARY KEY, tenant uuid NOT NULL, org uuid NOT NULL, ref varchar NOT NULL,
  revision integer NOT NULL, enabled boolean NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_code_review_event_origin ON plugin_code_review_event_route(tenant,org,ref);
CREATE TABLE IF NOT EXISTS plugin_code_review_event_fact (
  seq bigserial PRIMARY KEY, id uuid NOT NULL, binding uuid NOT NULL, source varchar NOT NULL,
  event jsonb NOT NULL, snapshot jsonb NOT NULL, receipt uuid, error varchar, decision jsonb, fence bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_code_review_event_fact_id ON plugin_code_review_event_fact(id);
CREATE UNIQUE INDEX IF NOT EXISTS plugin_code_review_event_identity ON plugin_code_review_event_fact(binding,source);
CREATE INDEX IF NOT EXISTS plugin_code_review_event_order ON plugin_code_review_event_fact(binding,seq);
COMMIT;
