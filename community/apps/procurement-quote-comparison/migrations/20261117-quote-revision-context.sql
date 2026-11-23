CREATE TABLE IF NOT EXISTS plugin_procurement_quote_context (
  binding uuid NOT NULL,
  source varchar NOT NULL,
  baseline date,
  "threadId" varchar,
  PRIMARY KEY (binding, source)
);
