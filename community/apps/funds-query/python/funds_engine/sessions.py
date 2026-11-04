"""Dataset-scoped conversations; platform thread IDs come only from trusted middleware."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from .contracts import BusinessError, bounded_text, multiline_text


class SessionStore:
    def init_sessions(self):
        # Serialize the additive upgrade across short-lived workers.
        self.db.execute('BEGIN IMMEDIATE')
        try:
            self.db.execute('''CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, dataset TEXT NOT NULL REFERENCES datasets(id),
                title TEXT NOT NULL, operation_id TEXT NOT NULL, created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL, conversation_id TEXT UNIQUE, thread_id TEXT,
                UNIQUE(dataset,operation_id))''')
            self.db.execute('''CREATE TABLE IF NOT EXISTS session_selections (
                dataset TEXT PRIMARY KEY REFERENCES datasets(id), session_id TEXT NOT NULL REFERENCES sessions(id))''')
            self.db.execute('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)')
            columns = {r['name'] for r in self.db.execute('PRAGMA table_info(questions)')}
            for name, definition in {
                'session_id': 'TEXT', 'execution_id': 'TEXT', 'reply': 'TEXT',
                'reply_status': "TEXT NOT NULL DEFAULT 'unavailable'",
                'stage': "TEXT NOT NULL DEFAULT 'submitted'"
            }.items():
                if name not in columns:
                    self.db.execute(f'ALTER TABLE questions ADD COLUMN {name} {definition}')
            self.db.execute('CREATE INDEX IF NOT EXISTS questions_session ON questions(session_id,created_at,id)')
            if not self.db.execute("SELECT 1 FROM app_meta WHERE key='sessions_v1'").fetchone():
                self.migrate_history()
                self.db.execute("INSERT INTO app_meta VALUES('sessions_v1','1')")
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

    def migrate_history(self):
        # Old explicit follow-up chains remain together; unrelated questions do not
        # silently acquire each other's old filters or platform context.
        rows = self.db.execute('SELECT * FROM questions WHERE session_id IS NULL ORDER BY created_at,id').fetchall()
        by_id = {r['id']: r for r in rows}
        for row in rows:
            root, seen = row, set()
            while root['base_query_id'] in by_id and root['base_query_id'] not in seen:
                seen.add(root['id'])
                parent = by_id[root['base_query_id']]
                if parent['dataset'] != row['dataset']:
                    break
                root = parent
            session_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"funds-query:{row['dataset']}:{root['id']}"))
            self.db.execute('''INSERT OR IGNORE INTO sessions
                (id,dataset,title,operation_id,created_at,updated_at) VALUES(?,?,?,?,?,?)''',
                (session_id, row['dataset'], root['question'][:80], 'legacy:' + root['id'], root['created_at'], row['updated_at']))
            self.db.execute('UPDATE questions SET session_id=? WHERE id=?', (session_id, row['id']))
            self.db.execute('UPDATE sessions SET updated_at=MAX(updated_at,?) WHERE id=?', (row['updated_at'], session_id))

    def session(self, session_id, dataset_id=None):
        row = self.db.execute('''SELECT s.* FROM sessions s JOIN datasets d ON d.id=s.dataset
            WHERE s.id=? AND d.tenant=? AND d.org=? AND d.owner=?''', (session_id, *self.scope)).fetchone()
        if not row or (dataset_id and row['dataset'] != dataset_id):
            raise BusinessError('session_not_found', '会话不存在或不属于当前数据集。')
        return row

    def session_dto(self, row):
        latest = self.db.execute('SELECT * FROM questions WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1', (row['id'],)).fetchone()
        return {'id': row['id'], 'datasetId': row['dataset'], 'title': row['title'],
                'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
                'conversationId': row['conversation_id'], 'threadId': row['thread_id'],
                'turnCount': self.db.execute('SELECT count(*) FROM questions WHERE session_id=?', (row['id'],)).fetchone()[0],
                'running': bool(latest and (self.question_state(latest)['status'] == 'pending' or self.reply_state(latest) == 'pending'))}

    def reply_state(self, row):
        if row['reply_status'] == 'pending' and (self.now - datetime.fromisoformat(row['updated_at'])).total_seconds() > 180:
            return 'unconfirmed'
        return row['reply_status']

    def create_session(self, dataset_id, operation_id, title='新会话'):
        self.dataset(dataset_id)
        with self.db:
            self.db.execute('''INSERT OR IGNORE INTO sessions
                (id,dataset,title,operation_id,created_at,updated_at) VALUES(?,?,?,?,?,?)''',
                (str(uuid.uuid4()), dataset_id, title, operation_id, self.timestamp(), self.timestamp()))
            row = self.db.execute('SELECT * FROM sessions WHERE dataset=? AND operation_id=?', (dataset_id, operation_id)).fetchone()
            self.db.execute('INSERT OR REPLACE INTO session_selections VALUES(?,?)', (dataset_id, row['id']))
        return self.session_dto(row)

    def select_session(self, dataset_id, session_id):
        row = self.session(session_id, dataset_id)
        with self.db:
            self.db.execute('INSERT OR REPLACE INTO session_selections VALUES(?,?)', (dataset_id, session_id))
        return self.session_dto(row)

    def current_session(self, dataset_id):
        self.dataset(dataset_id)
        selected = self.db.execute('SELECT session_id FROM session_selections WHERE dataset=?', (dataset_id,)).fetchone()
        if selected:
            return self.session(selected['session_id'], dataset_id)
        row = self.db.execute('SELECT * FROM sessions WHERE dataset=? ORDER BY updated_at DESC,id DESC LIMIT 1', (dataset_id,)).fetchone()
        if not row:
            return self.session(self.create_session(dataset_id, 'initial')['id'], dataset_id)
        self.select_session(dataset_id, row['id'])
        return row

    def sessions(self, dataset_id, page=1, page_size=20):
        self.dataset(dataset_id)
        rows = self.db.execute('SELECT * FROM sessions WHERE dataset=? ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?',
                               (dataset_id, page_size, (page - 1) * page_size)).fetchall()
        total = self.db.execute('SELECT count(*) FROM sessions WHERE dataset=?', (dataset_id,)).fetchone()[0]
        return {'items': [self.session_dto(r) for r in rows], 'total': total, 'page': page, 'pageSize': page_size}

    def chat(self, dataset_id, session_id=None, page=1, page_size=20):
        from .analytics import query_result
        session = self.session(session_id, dataset_id) if session_id else self.current_session(dataset_id)
        rows = self.db.execute('SELECT * FROM questions WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT ? OFFSET ?',
                               (session['id'], page_size, (page - 1) * page_size)).fetchall()
        turns = []
        for row in reversed(rows):
            state = self.question_state(row)
            turns.append({'queryId': row['id'], 'sessionId': session['id'], 'question': row['question'],
                          'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
                          'status': state['status'], 'stage': row['stage'],
                          'reply': row['reply'] or '', 'replyStatus': self.reply_state(row),
                          'baseQueryId': row['base_query_id'], 'result': query_result(self, row['id'], 1, 10)})
        total = self.db.execute('SELECT count(*) FROM questions WHERE session_id=?', (session['id'],)).fetchone()[0]
        return {'dataset': self.dataset_dto(self.dataset(dataset_id)), 'session': self.session_dto(session),
                'turns': {'items': turns, 'total': total, 'page': page, 'pageSize': page_size},
                'sessions': self.sessions(dataset_id)}

    def bind_runtime(self, query_id, runtime):
        with self.db:
            self.db.execute('BEGIN IMMEDIATE')
            row = self.question(query_id)
            if not row['session_id']:
                return row
            session = self.session(row['session_id'], row['dataset'])
            conversation_id = runtime.get('conversationId')
            thread_id = runtime.get('threadId')
            execution_id = runtime.get('executionId')
            if not conversation_id or not thread_id or not execution_id:
                raise BusinessError('runtime_required', '缺少真实助手会话上下文，请重新打开助手后提问。')
            for value in (conversation_id, thread_id, execution_id):
                bounded_text(value, '运行编号', 200)
            if session['conversation_id'] and (session['conversation_id'] != conversation_id or session['thread_id'] != thread_id):
                raise BusinessError('session_context_mismatch', '助手上下文与当前会话不一致，请重新打开这个会话后再提问。')
            if row['execution_id'] and row['execution_id'] != execution_id:
                raise BusinessError('query_execution_mismatch', '该问题已由另一次执行处理，请勿重复提交。')
            other = self.db.execute('SELECT id FROM sessions WHERE conversation_id=? AND id<>?', (conversation_id, session['id'])).fetchone()
            if other:
                raise BusinessError('session_context_mismatch', '新会话必须使用独立的助手上下文。')
            self.db.execute('UPDATE sessions SET conversation_id=?,thread_id=? WHERE id=?', (conversation_id, thread_id, session['id']))
            self.db.execute('UPDATE questions SET execution_id=? WHERE id=?', (execution_id, query_id))
            return self.question(query_id)


    def runtime_progress(self, query_id, runtime, stage, reply=None):
        stages = {'thinking', 'reading_context', 'finding_accounts', 'analyzing', 'replying', 'completed', 'failed'}
        if stage not in stages:
            raise BusinessError('invalid_stage', '不支持的处理阶段。')
        row = self.bind_runtime(query_id, runtime)
        with self.db:
            self.db.execute('UPDATE questions SET stage=? WHERE id=?', (stage, query_id))
            if reply is not None:
                reply = multiline_text(reply, '助手回复', 32000, False)
                status = ('answered' if reply else 'failed') if row['status'] == 'pending' else row['status']
                error = '助手未返回可显示的回答，请重新提问。' if row['status'] == 'pending' and not reply else row['error']
                self.db.execute("UPDATE questions SET reply=?,reply_status='completed',status=?,error=?,updated_at=? WHERE id=?",
                                (reply, status, error, self.timestamp(), query_id))
            if row['session_id']:
                self.db.execute('UPDATE sessions SET updated_at=? WHERE id=?', (self.timestamp(), row['session_id']))
        return {'queryId': query_id, 'stage': stage}
