from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .contracts import BusinessError, identity, money, multiline_text
from .importer import parse_workbook
from .sessions import SessionStore


class Store(SessionStore):
    def __init__(self, directory, scope, now=None):
        self.scope = identity(scope)
        self.now = now or datetime.now(timezone.utc)
        directory = Path(directory)
        directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        path = directory / "funds-query.sqlite3"
        # Create with private permissions before SQLite sees the file.
        fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        self.db = sqlite3.connect(str(path), timeout=15)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA foreign_keys=ON")
        self.enable_wal()
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS datasets (
            id TEXT PRIMARY KEY, tenant TEXT NOT NULL, org TEXT NOT NULL, owner TEXT NOT NULL,
            filename TEXT NOT NULL, digest TEXT NOT NULL, sheet TEXT NOT NULL,
            row_count INTEGER NOT NULL, amount_cents INTEGER NOT NULL, first_at TEXT NOT NULL,
            last_at TEXT NOT NULL, created_at TEXT NOT NULL, original BLOB NOT NULL,
            UNIQUE(tenant,org,owner,digest));
          CREATE TABLE IF NOT EXISTS transfers (
            dataset TEXT NOT NULL REFERENCES datasets(id), transaction_id TEXT NOT NULL,
            paid_at TEXT NOT NULL, payer TEXT NOT NULL, payer_name TEXT NOT NULL,
            payee TEXT NOT NULL, payee_name TEXT NOT NULL, amount_cents INTEGER NOT NULL,
            note TEXT NOT NULL, source_row INTEGER NOT NULL, PRIMARY KEY(dataset,transaction_id));
          CREATE INDEX IF NOT EXISTS transfers_time ON transfers(dataset,paid_at,transaction_id);
          CREATE INDEX IF NOT EXISTS transfers_payer ON transfers(dataset,payer,paid_at);
          CREATE INDEX IF NOT EXISTS transfers_payee ON transfers(dataset,payee,paid_at);
          CREATE TABLE IF NOT EXISTS selections (
            tenant TEXT NOT NULL, org TEXT NOT NULL, owner TEXT NOT NULL, dataset TEXT NOT NULL,
            PRIMARY KEY(tenant,org,owner));
          CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY, dataset TEXT NOT NULL REFERENCES datasets(id), question TEXT NOT NULL,
            status TEXT NOT NULL, plan TEXT, result TEXT, error TEXT,
            operation_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            base_query_id TEXT,
            UNIQUE(dataset,operation_id));
        """)
        self.init_sessions()

    def close(self):
        self.db.close()

    def enable_wal(self):
        deadline = time.monotonic() + 15
        while True:
            try:
                if self.db.execute('PRAGMA journal_mode').fetchone()[0] != 'wal':
                    self.db.execute('PRAGMA journal_mode=WAL')
                return
            except sqlite3.OperationalError as error:
                # Changing journal mode can fail immediately during concurrent
                # startup even when the connection has a busy timeout.
                code = getattr(error, 'sqlite_errorcode', 0) & 0xff
                if code not in {sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED} or time.monotonic() >= deadline:
                    self.db.close()
                    raise
                time.sleep(0.05)

    def timestamp(self):
        return self.now.isoformat()

    def dataset(self, dataset_id=None):
        if not dataset_id:
            selected = self.db.execute("SELECT dataset FROM selections WHERE tenant=? AND org=? AND owner=?", self.scope).fetchone()
            dataset_id = selected[0] if selected else ""
        row = self.db.execute("SELECT * FROM datasets WHERE id=? AND tenant=? AND org=? AND owner=?", (dataset_id, *self.scope)).fetchone()
        if not row:
            raise BusinessError("dataset_not_found", "请先选择一个已导入的数据集。")
        return row

    @staticmethod
    def dataset_dto(row):
        return {"id": row["id"], "name": row["filename"], "rowCount": row["row_count"], "amount": money(row["amount_cents"]), "currency": "CNY", "firstAt": row["first_at"], "lastAt": row["last_at"], "createdAt": row["created_at"], "sheet": row["sheet"]}

    def select(self, dataset_id):
        row = self.dataset(dataset_id)
        with self.db:
            self.db.execute("INSERT OR REPLACE INTO selections VALUES(?,?,?,?)", (*self.scope, row["id"]))
        return self.dataset_dto(row)

    def datasets(self, page=1, page_size=20):
        offset = (page - 1) * page_size
        rows = self.db.execute("SELECT * FROM datasets WHERE tenant=? AND org=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", (*self.scope, page_size, offset)).fetchall()
        total = self.db.execute("SELECT count(*) FROM datasets WHERE tenant=? AND org=? AND owner=?", self.scope).fetchone()[0]
        return {"items": [self.dataset_dto(r) for r in rows], "total": total, "page": page, "pageSize": page_size}

    def import_file(self, content, filename):
        digest = hashlib.sha256(content).hexdigest()
        existing = self.db.execute("SELECT * FROM datasets WHERE tenant=? AND org=? AND owner=? AND digest=?", (*self.scope, digest)).fetchone()
        if existing:
            return {"dataset": self.select(existing["id"]), "reused": True}
        records, sheet = parse_workbook(content, filename)
        dataset_id = str(uuid.uuid4())
        reused = False
        with self.db:
            try:
                self.db.execute("INSERT INTO datasets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", (dataset_id, *self.scope, filename, digest, sheet, len(records), sum(r[6] for r in records), min(r[1] for r in records), max(r[1] for r in records), self.timestamp(), content))
                self.db.executemany("INSERT INTO transfers VALUES(?,?,?,?,?,?,?,?,?,?)", [(dataset_id, *r) for r in records])
            except sqlite3.IntegrityError:
                # A concurrent import of identical bytes may have won the unique constraint.
                winner = self.db.execute("SELECT id FROM datasets WHERE tenant=? AND org=? AND owner=? AND digest=?", (*self.scope, digest)).fetchone()
                if not winner:
                    raise
                dataset_id = winner[0]
                reused = True
        return {"dataset": self.select(dataset_id), "reused": reused}

    def accounts(self, dataset_id, search="", limit=20):
        self.dataset(dataset_id)
        # Account aliases stay separate evidence; only exact account identifiers identify an account.
        base = """SELECT account, name FROM (
            SELECT payer AS account,payer_name AS name FROM transfers WHERE dataset=?
            UNION SELECT payee,payee_name FROM transfers WHERE dataset=?)
            WHERE instr(name,?)>0 OR instr(account,?)>0"""
        args = (dataset_id, dataset_id, search, search)
        rows = self.db.execute("SELECT account,group_concat(name,char(31)) AS names FROM (" + base + ") GROUP BY account ORDER BY account LIMIT ?", (*args, limit)).fetchall()
        total = self.db.execute("SELECT count(DISTINCT account) FROM (" + base + ")", args).fetchone()[0]
        items = [{"accountId": r["account"], "name": min(r["names"].split(chr(31))), "aliases": sorted(r["names"].split(chr(31)))[:3]} for r in rows]
        return {"items": items, "total": total, "hasMore": total > limit}

    def question(self, query_id):
        row = self.db.execute("SELECT q.* FROM questions q JOIN datasets d ON d.id=q.dataset WHERE q.id=? AND d.tenant=? AND d.org=? AND d.owner=?", (query_id, *self.scope)).fetchone()
        if not row:
            raise BusinessError("query_not_found", "未找到本次查询，请刷新后重试。")
        return row

    def prepare(self, dataset_id, question, operation_id, base_query_id=None, session_id=None):
        question = multiline_text(question, '问题', 1000)
        self.dataset(dataset_id)
        if base_query_id and self.question(base_query_id)["dataset"] != dataset_id:
            raise BusinessError("invalid_base_query", "追问不能跨数据集。")
        query_id = str(uuid.uuid4())
        self.db.execute('BEGIN IMMEDIATE')
        try:
            existing = self.db.execute('SELECT * FROM questions WHERE dataset=? AND operation_id=?', (dataset_id, operation_id)).fetchone()
            if existing:
                if existing['session_id'] != session_id:
                    raise BusinessError('operation_conflict', '此提交编号已用于另一个会话。')
                row = existing
            else:
                if session_id:
                    self.session(session_id, dataset_id)
                    previous = self.db.execute('SELECT * FROM questions WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1', (session_id,)).fetchone()
                    if previous and self.question_state(previous)['status'] == 'pending':
                        raise BusinessError('question_running', '这个会话还有问题正在处理，请等待结果后继续。')
                    if base_query_id and self.question(base_query_id)['session_id'] != session_id:
                        raise BusinessError('invalid_base_query', '不同会话之间不能继承查询条件。')
                    if not base_query_id:
                        base = self.db.execute("SELECT id FROM questions WHERE session_id=? AND status IN ('completed','needs_clarification') AND plan IS NOT NULL ORDER BY created_at DESC,rowid DESC LIMIT 1", (session_id,)).fetchone()
                        base_query_id = base['id'] if base else None
                self.db.execute('''INSERT INTO questions
                    (id,dataset,question,status,operation_id,created_at,updated_at,base_query_id,session_id,reply_status,stage)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?)''',
                    (query_id,dataset_id,question,'pending',operation_id,self.timestamp(),self.timestamp(),base_query_id,session_id,
                     'pending' if session_id else 'unavailable','submitted'))
                row = self.question(query_id)
                if session_id:
                    title = ' '.join(question.split())[:80] if self.db.execute('SELECT count(*) FROM questions WHERE session_id=?', (session_id,)).fetchone()[0] == 1 else self.session(session_id)['title']
                    self.db.execute('UPDATE sessions SET title=?,updated_at=? WHERE id=?', (title,self.timestamp(),session_id))
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        session = self.session(row['session_id'], dataset_id) if row['session_id'] else None
        return {"queryId": row['id'], "datasetId": dataset_id, "question": row['question'],
                'sessionId': row['session_id'], 'baseQueryId': row['base_query_id'],
                'conversationId': session['conversation_id'] if session else None,
                'threadId': session['thread_id'] if session else None}

    def update_question(self, query_id, status, plan, result=None, error=None):
        self.question(query_id)
        with self.db:
            self.db.execute("UPDATE questions SET status=?,plan=?,result=?,error=?,updated_at=? WHERE id=?", (status, json.dumps(plan, ensure_ascii=False), json.dumps(result, ensure_ascii=False) if result else None, error, self.timestamp(), query_id))

    def history(self, dataset_id, page=1, page_size=20):
        self.dataset(dataset_id)
        rows = self.db.execute("SELECT id,question,status,plan,error,created_at,updated_at,base_query_id FROM questions WHERE dataset=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", (dataset_id, page_size, (page - 1) * page_size)).fetchall()
        total = self.db.execute("SELECT count(*) FROM questions WHERE dataset=?", (dataset_id,)).fetchone()[0]
        items = []
        for row in rows:
            item = dict(row)
            item["queryId"] = item.pop("id")
            item["baseQueryId"] = item.pop("base_query_id")
            item.update(self.question_state(row))
            items.append(item)
        return {"items": items, "total": total, "page": page, "pageSize": page_size}

    def question_state(self, row):
        if row["status"] == "pending" and (self.now - datetime.fromisoformat(row["updated_at"])).total_seconds() > 180:
            return {"status": "waiting_timeout", "error": "暂未收到分析结果，助手可能仍在运行。请先查看对话或刷新，确认后再重新提交。"}
        return {"status": row["status"], "error": row["error"]}
