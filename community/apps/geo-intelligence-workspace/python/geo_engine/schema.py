"""Additive schema: migrations must preserve existing demo data."""
SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, version INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS edges (
 source TEXT NOT NULL, relation TEXT NOT NULL, target TEXT NOT NULL, document_id TEXT NOT NULL,
 PRIMARY KEY (source, relation, target, document_id));
CREATE TABLE IF NOT EXISTS runs (run_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS run_claims (run_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
 action TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_versions (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS faqs (
 id TEXT PRIMARY KEY, question TEXT NOT NULL, answer TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT '综合', keywords TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, brand TEXT NOT NULL,
 queries TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_run_index ON content_versions(run_id);
CREATE TABLE IF NOT EXISTS data_version (id INTEGER PRIMARY KEY CHECK (id=1), version INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO data_version (id, version) VALUES (1, 0);
"""
