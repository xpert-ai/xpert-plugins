import json
import sqlite3
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path

from funds_engine.analytics import run_query
from funds_engine.contracts import BusinessError
from funds_engine.storage import Store
from fixtures import workbook, records, ZHANG

SCOPE = {'tenantId':'tenant-a','organizationId':'org-a','userId':'user-a'}

class SessionTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory()
        self.store=Store(self.directory.name,SCOPE,datetime(2026,11,3,tzinfo=timezone.utc))
        self.dataset=self.store.import_file(workbook(),'标准.xlsx')['dataset']['id']
        self.session=self.store.create_session(self.dataset,'session-one')['id']
        self.runtime={'conversationId':'conversation-a','threadId':'thread-a','executionId':'execution-a'}
    def tearDown(self):
        self.store.close();self.directory.cleanup()
    def prepare(self,text='张三收款',session=None,op=None):
        return self.store.prepare(self.dataset,text,op or str(uuid.uuid4()),session_id=session or self.session)
    def execute(self,q,plan=None):
        return run_query(self.store,self.dataset,{'queryId':q['queryId'],'plan':plan or {'accountIds':[ZHANG],'period':'last_month'}})

    def test_new_sessions_are_independent_and_creation_is_idempotent(self):
        again=self.store.create_session(self.dataset,'session-one')
        other=self.store.create_session(self.dataset,'session-two')
        self.assertEqual(again['id'],self.session)
        self.assertNotEqual(other['id'],self.session)
        self.assertEqual(self.store.sessions(self.dataset)['total'],2)
        self.assertEqual(self.store.current_session(self.dataset)['id'],other['id'])

    def test_followup_inherits_only_within_its_session(self):
        first=self.prepare();self.execute(first)
        follow=self.prepare('只看超过五万')
        self.assertEqual(follow['baseQueryId'],first['queryId'])
        result=self.execute(follow,{'minAmount':'50000','minExclusive':True})
        self.assertEqual(result['amount'],'60000.00')
        new=self.store.create_session(self.dataset,'reset')['id']
        independent=self.prepare(session=new)
        self.assertIsNone(independent['baseQueryId'])
        self.assertEqual(self.execute(independent)['amount'],'90000.13')

    def test_explicit_cross_session_base_is_rejected(self):
        first=self.prepare();self.execute(first)
        other=self.store.create_session(self.dataset,'other')['id']
        with self.assertRaises(BusinessError):
            self.store.prepare(self.dataset,'跨会话','bad-base',first['queryId'],other)
        question=self.prepare(session=other)
        with self.assertRaises(BusinessError):
            run_query(self.store,self.dataset,{'queryId':question['queryId'],'baseQueryId':first['queryId'],'plan':{}})

    def test_session_cannot_select_or_prepare_another_dataset(self):
        other=self.store.import_file(workbook(records(ambiguous=True)),'同名.xlsx')['dataset']['id']
        with self.assertRaises(BusinessError): self.store.select_session(other,self.session)
        with self.assertRaises(BusinessError): self.store.prepare(other,'问题','wrong-file',session_id=self.session)

    def test_session_identity_scope_is_enforced(self):
        for key in SCOPE:
            other=Store(self.directory.name,{**SCOPE,key:'different'})
            try:
                with self.assertRaises(BusinessError):other.session(self.session)
                with self.assertRaises(BusinessError):other.chat(self.dataset,self.session)
            finally:other.close()

    def test_pending_question_is_idempotent_but_blocks_duplicate_submissions(self):
        first=self.prepare(op='same')
        self.assertEqual(self.prepare(op='same')['queryId'],first['queryId'])
        with self.assertRaises(BusinessError):self.prepare(op='different')
        other=self.store.create_session(self.dataset,'other')['id']
        with self.assertRaises(BusinessError):self.prepare(session=other,op='same')

    def test_runtime_binding_is_persisted_and_cannot_switch_threads(self):
        q=self.prepare()
        self.store.bind_runtime(q['queryId'],self.runtime)
        current=self.store.session(self.session)
        self.assertEqual(current['conversation_id'],'conversation-a')
        self.assertEqual(current['thread_id'],'thread-a')
        with self.assertRaises(BusinessError):self.store.bind_runtime(q['queryId'],{**self.runtime,'threadId':'another'})
        with self.assertRaises(BusinessError):self.store.bind_runtime(q['queryId'],{**self.runtime,'executionId':'another'})
        self.assertEqual(self.store.question(q['queryId'])['execution_id'],'execution-a')

    def test_new_session_cannot_reuse_another_sessions_platform_conversation(self):
        first=self.prepare();self.store.bind_runtime(first['queryId'],self.runtime)
        other=self.store.create_session(self.dataset,'other')['id']
        q=self.prepare(session=other)
        with self.assertRaises(BusinessError):self.store.bind_runtime(q['queryId'],{**self.runtime,'executionId':'execution-b'})
        self.assertIsNone(self.store.session(other)['conversation_id'])

    def test_final_reply_and_data_result_have_separate_states(self):
        q=self.prepare();self.store.bind_runtime(q['queryId'],self.runtime);self.execute(q)
        turn=self.store.chat(self.dataset,self.session)['turns']['items'][0]
        self.assertEqual(turn['result']['amount'],'90000.13')
        self.assertEqual(turn['replyStatus'],'pending')
        self.store.runtime_progress(q['queryId'],self.runtime,'completed','实际助手回复')
        turn=self.store.chat(self.dataset,self.session)['turns']['items'][0]
        self.assertEqual(turn['reply'],'实际助手回复')
        self.assertEqual(turn['replyStatus'],'completed')
        self.assertFalse(self.store.chat(self.dataset,self.session)['session']['running'])

    def test_text_only_answer_does_not_create_a_fake_zero_amount(self):
        q=self.prepare('解释统计口径')
        self.store.runtime_progress(q['queryId'],self.runtime,'completed','这是账面收款，不等同营业收入。')
        turn=self.store.chat(self.dataset,self.session)['turns']['items'][0]
        self.assertEqual(turn['status'],'answered')
        self.assertNotIn('amount',turn['result'])

    def test_multiline_questions_and_replies_are_preserved(self):
        q=self.prepare('张三十月收款\n请说明统计范围')
        self.store.runtime_progress(q['queryId'],self.runtime,'completed','第一段回复\n\n第二段回复')
        turn=self.store.chat(self.dataset,self.session)['turns']['items'][0]
        self.assertEqual(turn['question'],'张三十月收款\n请说明统计范围')
        self.assertEqual(turn['reply'],'第一段回复\n\n第二段回复')
        with self.assertRaises(BusinessError):self.prepare('不允许\x00控制字符')

    def test_pagination_and_reopen_keep_turns_chronological(self):
        for i in range(25):
            q=self.prepare(str(i))
            self.store.runtime_progress(q['queryId'],{**self.runtime,'executionId':f'run-{i}'},'completed',f'答复{i}')
        first=self.store.chat(self.dataset,self.session,page=1,page_size=20)['turns']
        older=self.store.chat(self.dataset,self.session,page=2,page_size=20)['turns']
        self.assertEqual([t['question'] for t in first['items']],[str(i) for i in range(5,25)])
        self.assertEqual([t['question'] for t in older['items']],[str(i) for i in range(5)])
        self.store.close();self.store=Store(self.directory.name,SCOPE)
        self.assertEqual(self.store.chat(self.dataset,self.session)['turns']['total'],25)

    def test_late_reply_recovers_after_wait_expired(self):
        q=self.prepare();self.store.bind_runtime(q['queryId'],self.runtime)
        self.store.now+=timedelta(seconds=181)
        turn=self.store.chat(self.dataset,self.session)['turns']['items'][0]
        self.assertEqual(turn['status'],'waiting_timeout')
        self.assertEqual(turn['replyStatus'],'unconfirmed')
        self.execute(q);self.store.runtime_progress(q['queryId'],self.runtime,'completed','晚到的正确回复')
        self.assertEqual(self.store.chat(self.dataset,self.session)['turns']['items'][0]['replyStatus'],'completed')

class MigrationTests(unittest.TestCase):
    def test_old_schema_upgrade_keeps_followup_chains_and_original_records(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'funds-query.sqlite3'
            db=sqlite3.connect(path)
            db.executescript('''
              CREATE TABLE datasets(id TEXT PRIMARY KEY,tenant TEXT,org TEXT,owner TEXT,filename TEXT,digest TEXT,sheet TEXT,row_count INTEGER,amount_cents INTEGER,first_at TEXT,last_at TEXT,created_at TEXT,original BLOB);
              CREATE TABLE questions(id TEXT PRIMARY KEY,dataset TEXT,question TEXT,status TEXT,plan TEXT,result TEXT,error TEXT,operation_id TEXT,created_at TEXT,updated_at TEXT,base_query_id TEXT,UNIQUE(dataset,operation_id));
            ''')
            dataset=str(uuid.uuid4());now='2026-11-03T00:00:00+00:00'
            db.execute('INSERT INTO datasets VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',(dataset,*SCOPE.values(),'旧文件.xlsx','old-digest','交易',1,123,'2026-10-01','2026-10-01',now,b'original-bytes'))
            first,follow,unrelated=[str(uuid.uuid4()) for _ in range(3)]
            for i,(qid,base) in enumerate([(first,None),(follow,first),(unrelated,None)]):
                db.execute('INSERT INTO questions VALUES(?,?,?,?,?,?,?,?,?,?,?)',(qid,dataset,f'历史{i}','failed',None,None,'旧错误',str(i),now,now,base))
            db.commit();db.close()
            def open_and_read(_):
                store=Store(directory,SCOPE)
                try:return store.sessions(dataset)['total']
                finally:store.close()
            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(list(pool.map(open_and_read,range(2))),[2,2])
            store=Store(directory,SCOPE)
            try:
                self.assertEqual(store.question(first)['session_id'],store.question(follow)['session_id'])
                self.assertNotEqual(store.question(first)['session_id'],store.question(unrelated)['session_id'])
                self.assertEqual(store.dataset(dataset)['original'],b'original-bytes')
                self.assertEqual(store.db.execute('SELECT count(*) FROM questions').fetchone()[0],3)
            finally:store.close()

if __name__=='__main__':unittest.main()
