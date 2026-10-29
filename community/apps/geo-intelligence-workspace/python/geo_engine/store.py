from __future__ import annotations

import json
import sqlite3
import hashlib
from contextlib import contextmanager
from dataclasses import asdict
from datetime import datetime, timezone
from threading import RLock

from .domain import AnswerMetrics, ContentVersion, DocumentStatus, FAQItem, KnowledgeDocument, KnowledgeEdge, RunRecord
from .schema import SCHEMA
from .errors import IdempotencyConflict, RunInProgress


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class GeoStore:
    """Small transactional store with stable ids and audit history."""

    def __init__(self, path: str = ":memory:") -> None:
        self.connection = sqlite3.connect(path, check_same_thread=False, timeout=10, isolation_level=None)
        self.connection.row_factory = sqlite3.Row
        self._lock = RLock()
        self.connection.execute("PRAGMA journal_mode=WAL")
        self.connection.execute("PRAGMA busy_timeout=10000")
        self.connection.executescript(SCHEMA)

    @contextmanager
    def transaction(self):
        """Serialize this connection and reserve a writer across other processes."""
        with self._lock:
            nested = self.connection.in_transaction
            if not nested:
                self.connection.execute("BEGIN IMMEDIATE")
            try:
                yield
                if not nested:
                    self.connection.commit()
            except BaseException:
                if not nested:
                    self.connection.rollback()
                raise

    def claim_run(self, run_id: str, request: dict) -> RunRecord | None:
        fingerprint = hashlib.sha256(json.dumps(request, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        with self.transaction():
            claim = self.connection.execute("SELECT fingerprint FROM run_claims WHERE run_id=?", (run_id,)).fetchone()
            if claim and claim["fingerprint"] != fingerprint:
                raise IdempotencyConflict("Run id already belongs to a different request")
            existing = self.get_run(run_id)
            if existing:
                if not claim and (existing.query != request["query"] or existing.brand != request["brand"]["name"]):
                    raise IdempotencyConflict("Run id already belongs to a different request")
                return existing
            if claim:
                raise RunInProgress("Run is processing; refresh instead of submitting again")
            self.connection.execute("INSERT INTO run_claims VALUES (?,?,?)", (run_id, fingerprint, datetime.now(timezone.utc).isoformat()))
        return None

    def close(self) -> None:
        with self._lock:
            self.connection.close()

    def get_data_version(self) -> int:
        with self._lock:
            row = self.connection.execute("SELECT version FROM data_version WHERE id=1").fetchone()
            return row["version"] if row else 0

    def bump_data_version(self) -> int:
        with self._lock:
            self.connection.execute("UPDATE data_version SET version = version + 1 WHERE id=1")
            row = self.connection.execute("SELECT version FROM data_version WHERE id=1").fetchone()
            return row["version"] if row else 0

    def save_document(self, document: KnowledgeDocument, *, actor: str) -> None:
        with self.transaction():
            prior = self.connection.execute("SELECT version FROM documents WHERE id = ?", (document.id,)).fetchone()
            if prior and document.version > prior["version"]:
                self.connection.execute("DELETE FROM edges WHERE document_id = ?", (document.id,))
            self.connection.execute(
                "INSERT INTO documents(id, version, payload) VALUES (?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload=excluded.payload",
                (document.id, document.version, _json(asdict(document))),
            )
            self._audit("document", document.id, str(document.status), actor)
            self.bump_data_version()

    def save_edge(self, edge: KnowledgeEdge, *, actor: str) -> None:
        with self.transaction():
            self.connection.execute(
                "INSERT OR IGNORE INTO edges(source, relation, target, document_id) VALUES (?, ?, ?, ?)",
                (edge.source, edge.relation, edge.target, edge.document_id),
            )
            self._audit("edge", edge.document_id, "linked", actor)
            self.bump_data_version()

    def load_documents(self) -> list[KnowledgeDocument]:
        with self._lock:
            rows = self.connection.execute("SELECT payload FROM documents ORDER BY id").fetchall()
        result = []
        for row in rows:
            payload = json.loads(row["payload"])
            payload["entities"] = tuple(payload["entities"])
            payload["status"] = DocumentStatus(payload["status"])
            result.append(KnowledgeDocument(**payload))
        return result

    def load_edges(self) -> list[KnowledgeEdge]:
        with self._lock:
            rows = self.connection.execute("SELECT source, relation, target, document_id FROM edges").fetchall()
        return [KnowledgeEdge(**dict(row)) for row in rows]

    def save_run(self, run: RunRecord) -> RunRecord:
        """Idempotent create: an existing run id always returns its original result."""
        with self.transaction():
            existing = self.get_run(run.run_id)
            if existing is not None:
                return existing
            self.connection.execute(
                "INSERT OR IGNORE INTO runs(run_id, payload, created_at) VALUES (?, ?, ?)",
                (run.run_id, _json(asdict(run)), datetime.now(timezone.utc).isoformat()),
            )
            self._audit("run", run.run_id, "created", "engine")
            self.bump_data_version()
        return self.get_run(run.run_id) or run

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            row = self.connection.execute("SELECT payload FROM runs WHERE run_id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        payload = json.loads(row["payload"])
        payload["metrics"] = AnswerMetrics(**{
            **payload["metrics"],
            "competitor_mentions": tuple(payload["metrics"]["competitor_mentions"]),
            "citation_urls": tuple(payload["metrics"]["citation_urls"]),
        })
        payload["evidence_ids"] = tuple(payload["evidence_ids"])
        payload["sources"] = tuple(payload["sources"])
        for field in ("aliases", "competitors", "trace"):
            payload[field] = tuple(payload.get(field, ()))
        payload["evidence_versions"] = tuple(tuple(pair) for pair in payload.get("evidence_versions", ()))
        return RunRecord(**payload)

    def list_runs(self, *, limit: int = 100) -> list[RunRecord]:
        with self._lock:
            rows = self.connection.execute(
                "SELECT payload FROM runs ORDER BY created_at DESC LIMIT ?", (min(max(limit, 1), 500),)
            ).fetchall()
        result = []
        for row in rows:
            payload = json.loads(row["payload"])
            payload["metrics"] = AnswerMetrics(**{
                **payload["metrics"],
                "competitor_mentions": tuple(payload["metrics"]["competitor_mentions"]),
                "citation_urls": tuple(payload["metrics"]["citation_urls"]),
            })
            payload["evidence_ids"] = tuple(payload["evidence_ids"])
            payload["sources"] = tuple(payload["sources"])
            for field in ("aliases", "competitors", "trace"):
                payload[field] = tuple(payload.get(field, ()))
            payload["evidence_versions"] = tuple(tuple(pair) for pair in payload.get("evidence_versions", ()))
            result.append(RunRecord(**payload))
        return result

    def save_content(self, content: ContentVersion, *, actor: str) -> ContentVersion:
        if not content.text.strip():
            raise ValueError("Content cannot be empty")
        if not actor.strip():
            raise ValueError("Author identity is required")
        if content.actor != actor:
            raise ValueError("Author identity mismatch")
        if not content.evidence_ids:
            raise ValueError("Approved evidence is required")
        if content.previous_version_id:
            previous = self.get_content(content.previous_version_id)
            if previous is None or previous.run_id != content.run_id:
                raise ValueError("Previous version must belong to the same run")
        if self.get_run(content.run_id) is None:
            raise ValueError("Content must belong to a saved run")
        with self.transaction():
            self.connection.execute(
                "INSERT INTO content_versions(id, run_id, payload, created_at) VALUES (?, ?, ?, ?)",
                (content.id, content.run_id, _json(asdict(content)), datetime.now(timezone.utc).isoformat()),
            )
            self._audit("content", content.id, content.status, actor)
            self.bump_data_version()
        return content

    def get_content(self, content_id: str) -> ContentVersion | None:
        with self._lock:
            row = self.connection.execute("SELECT payload FROM content_versions WHERE id = ?", (content_id,)).fetchone()
        if not row:
            return None
        payload = json.loads(row["payload"])
        payload["evidence_ids"] = tuple(payload.get("evidence_ids", ()))
        payload["evidence_versions"] = tuple(tuple(pair) for pair in payload.get("evidence_versions", ()))
        return ContentVersion(**payload)

    def approve_content(self, content_id: str, *, reviewer: str) -> ContentVersion:
        if not reviewer.strip():
            raise ValueError("Reviewer identity is required")
        with self.transaction():
            current = self.get_content(content_id)
            if current is None or current.status != "draft":
                raise ValueError("Only an existing draft can be approved")
            if current.actor == reviewer:
                raise ValueError("Author and reviewer must be different people")
            approved = ContentVersion(
                id=current.id,
                run_id=current.run_id,
                text=current.text,
                status="approved",
                approved_by=reviewer,
                previous_version_id=current.previous_version_id,
                actor=current.actor,
                evidence_ids=current.evidence_ids,
                evidence_versions=current.evidence_versions,
            )
            self.connection.execute("UPDATE content_versions SET payload = ? WHERE id = ?", (_json(asdict(approved)), content_id))
            self._audit("content", content_id, "approved", reviewer)
            self.bump_data_version()
            return approved

    def list_content(self, *, run_id: str) -> list[ContentVersion]:
        with self._lock:
            rows = self.connection.execute(
                "SELECT payload FROM content_versions WHERE run_id = ? ORDER BY created_at", (run_id,)
            ).fetchall()
        versions = []
        for row in rows:
            payload = json.loads(row["payload"])
            payload["evidence_ids"] = tuple(payload.get("evidence_ids", ()))
            payload["evidence_versions"] = tuple(tuple(pair) for pair in payload.get("evidence_versions", ()))
            versions.append(ContentVersion(**payload))
        return versions

    def _audit(self, object_type: str, object_id: str, action: str, actor: str) -> None:
        self.connection.execute(
            "INSERT INTO audit_events(object_type, object_id, action, actor, created_at) VALUES (?, ?, ?, ?, ?)",
            (object_type, object_id, action, actor, datetime.now(timezone.utc).isoformat()),
        )

    def save_prompt(self, prompt_id: str, payload: dict) -> dict:
        with self.transaction():
            self.connection.execute(
                "INSERT INTO prompts VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
                (prompt_id, _json(payload), datetime.now(timezone.utc).isoformat()),
            )
            self._audit("prompt", prompt_id, "saved", payload["actor"])
            self.bump_data_version()
        return payload

    def list_prompts(self) -> list[dict]:
        with self._lock:
            rows = self.connection.execute("SELECT payload FROM prompts ORDER BY created_at DESC LIMIT 200").fetchall()
        return [json.loads(row["payload"]) for row in rows]

    def save_faq(self, faq: FAQItem, *, actor: str) -> FAQItem:
        with self.transaction():
            self.connection.execute(
                "INSERT INTO faqs(id, question, answer, category, keywords, status, created_by, created_at) "
                "VALUES (?,?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET question=excluded.question, answer=excluded.answer, "
                "category=excluded.category, keywords=excluded.keywords, status=excluded.status",
                (faq.id, faq.question, faq.answer, faq.category,
                 ",".join(faq.keywords), faq.status, faq.created_by,
                 datetime.now(timezone.utc).isoformat()),
            )
            self._audit("faq", faq.id, faq.status, actor)
            self.bump_data_version()
        return faq

    def list_faqs(self, *, status: str | None = None) -> list[FAQItem]:
        with self._lock:
            if status:
                rows = self.connection.execute(
                    "SELECT id, question, answer, category, keywords, status, created_by FROM faqs WHERE status=? ORDER BY created_at",
                    (status,),
                ).fetchall()
            else:
                rows = self.connection.execute(
                    "SELECT id, question, answer, category, keywords, status, created_by FROM faqs ORDER BY created_at"
                ).fetchall()
        return [
            FAQItem(
                id=row["id"], question=row["question"], answer=row["answer"],
                category=row["category"],
                keywords=tuple(k for k in row["keywords"].split(",") if k.strip()) if row["keywords"] else (),
                status=row["status"], created_by=row["created_by"],
            )
            for row in rows
        ]

    def get_faq(self, faq_id: str) -> FAQItem | None:
        with self._lock:
            row = self.connection.execute(
                "SELECT id, question, answer, category, keywords, status, created_by FROM faqs WHERE id=?",
                (faq_id,),
            ).fetchone()
        if not row:
            return None
        return FAQItem(
            id=row["id"], question=row["question"], answer=row["answer"],
            category=row["category"],
            keywords=tuple(k for k in row["keywords"].split(",") if k.strip()) if row["keywords"] else (),
            status=row["status"], created_by=row["created_by"],
        )

    def approve_faq(self, faq_id: str) -> FAQItem:
        with self.transaction():
            current = self.get_faq(faq_id)
            if current is None:
                raise ValueError("FAQ not found")
            if current.status == "approved":
                return current
            self.connection.execute("UPDATE faqs SET status='approved' WHERE id=?", (faq_id,))
            self._audit("faq", faq_id, "approved", "reviewer")
            self.bump_data_version()
        return self.get_faq(faq_id)

    def save_task(self, task_id: str, name: str, brand: str, queries: list[str], created_by: str) -> dict:
        with self.transaction():
            self.connection.execute(
                "INSERT INTO tasks(id, name, brand, queries, status, created_by, created_at) VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(id) DO UPDATE SET name=excluded.name, brand=excluded.brand, queries=excluded.queries",
                (task_id, name, brand, json.dumps(queries, ensure_ascii=False), "pending", created_by,
                 datetime.now(timezone.utc).isoformat()),
            )
            self._audit("task", task_id, "created", created_by)
            self.bump_data_version()
        return {"id": task_id, "name": name, "brand": brand, "queries": queries, "status": "pending", "created_by": created_by}

    def list_tasks(self) -> list[dict]:
        with self._lock:
            rows = self.connection.execute("SELECT * FROM tasks ORDER BY created_at DESC").fetchall()
        return [dict(row) for row in rows]

    def get_task(self, task_id: str) -> dict | None:
        with self._lock:
            row = self.connection.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None

    def update_task_status(self, task_id: str, status: str) -> None:
        with self.transaction():
            self.connection.execute("UPDATE tasks SET status=? WHERE id=?", (status, task_id))
            self._audit("task", task_id, status, "system")
            self.bump_data_version()

    def update_task(self, task_id: str, name: str | None, brand: str | None, queries: list[str] | None) -> dict | None:
        task = self.get_task(task_id)
        if task is None:
            return None
        with self.transaction():
            if name is not None:
                self.connection.execute("UPDATE tasks SET name=? WHERE id=?", (name, task_id))
            if brand is not None:
                self.connection.execute("UPDATE tasks SET brand=? WHERE id=?", (brand, task_id))
            if queries is not None:
                self.connection.execute("UPDATE tasks SET queries=? WHERE id=?", (json.dumps(queries, ensure_ascii=False), task_id))
            self._audit("task", task_id, "updated", "user")
            self.bump_data_version()
        return self.get_task(task_id)

    def delete_task(self, task_id: str) -> bool:
        with self.transaction():
            cur = self.connection.execute("DELETE FROM tasks WHERE id=?", (task_id,))
            if cur.rowcount:
                self._audit("task", task_id, "deleted", "user")
                self.bump_data_version()
            return bool(cur.rowcount)

    def delete_run(self, run_id: str) -> bool:
        with self.transaction():
            cur = self.connection.execute("DELETE FROM runs WHERE run_id=?", (run_id,))
            if cur.rowcount:
                self._audit("run", run_id, "deleted", "user")
                self.bump_data_version()
            return bool(cur.rowcount)

    def delete_prompt(self, prompt_id: str) -> bool:
        with self.transaction():
            cur = self.connection.execute("DELETE FROM prompts WHERE id=?", (prompt_id,))
            if cur.rowcount:
                self._audit("prompt", prompt_id, "deleted", "user")
                self.bump_data_version()
            return bool(cur.rowcount)

    def delete_faq(self, faq_id: str) -> bool:
        with self.transaction():
            cur = self.connection.execute("DELETE FROM faqs WHERE id=?", (faq_id,))
            if cur.rowcount:
                self._audit("faq", faq_id, "deleted", "user")
                self.bump_data_version()
            return bool(cur.rowcount)
