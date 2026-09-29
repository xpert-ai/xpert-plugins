import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from geo_engine.api import create_app
from geo_engine.errors import RunInProgress, IdempotencyConflict, ProviderUnavailable
from geo_engine.llm import DeepSeekChatClient
from geo_engine.store import GeoStore
from geo_engine.retrieval import RetrievalEngine
from test_geo_engine import FakeChat, make_catalog


class ReviewRegressions(unittest.TestCase):
    def test_two_connections_only_one_claims_same_run(self):
        with tempfile.TemporaryDirectory() as folder:
            stores = [GeoStore(str(Path(folder) / 'db.sqlite')) for _ in range(2)]
            request = {'query': 'test', 'brand': {'name': 'hospital'}}
            def claim(store):
                try:
                    store.claim_run('one', request)
                    return 'claimed'
                except RunInProgress:
                    return 'pending'
            try:
                with ThreadPoolExecutor(2) as pool:
                    self.assertCountEqual(list(pool.map(claim, stores)), ['claimed', 'pending'])
                with self.assertRaises(IdempotencyConflict):
                    stores[0].claim_run('one', {**request, 'query': 'different'})
            finally:
                for store in stores:
                    store.close()

    def test_retry_is_bounded_and_does_not_sleep_after_final_attempt(self):
        calls, sleeps = [], []
        def handler(request):
            calls.append(request)
            raise httpx.ConnectError('simulated', request=request)
        client = DeepSeekChatClient(api_key='fake', transport=httpx.MockTransport(handler), sleep=sleeps.append)
        try:
            with self.assertRaises(ProviderUnavailable):
                client.complete([{'role': 'user', 'content': 'test'}])
            self.assertEqual(len(calls), 3)
            self.assertEqual(len(sleeps), 2)
        finally:
            client.close()

    def test_lru_retains_recent_entry_and_expires(self):
        engine = RetrievalEngine(make_catalog())
        engine.cache_capacity = 2
        engine.retrieve('儿科')
        engine.retrieve('预约')
        engine.retrieve('儿科')
        engine.retrieve('院区')
        self.assertEqual([key[0] for key in engine._cache], ['儿科', '院区'])
        engine.cache_ttl_seconds = -1
        engine.retrieve('挂号')
        engine.retrieve('流程')
        self.assertNotIn('挂号', [key[0] for key in engine._cache])

    def test_missing_token_configuration_is_503(self):
        store = GeoStore()
        with TestClient(create_app(store=store, chat=FakeChat(), internal_token='')) as client:
            self.assertEqual(client.get('/runs').status_code, 503)
        store.close()

    def test_invalid_edge_does_not_partially_approve_document(self):
        store = GeoStore()
        headers = {'X-GEO-TOKEN': 'test'}
        with TestClient(create_app(store=store, chat=FakeChat(), internal_token='test')) as client:
            self.assertEqual(client.post('/documents', headers=headers, json={'id':'d','title':'t','text':'evidence','owner':'editor'}).status_code, 200)
            result = client.post('/documents/d/review', headers=headers, json={'reviewer':'reviewer','approve':True,'edges':[{'source':'a','target':'b'}]})
            self.assertEqual(result.status_code, 422)
            self.assertEqual(store.load_documents()[0].status, 'draft')
            self.assertEqual(client.post('/documents/missing/review', headers=headers, json={'reviewer':'r','approve':True}).status_code, 404)
        store.close()

    def test_stale_evidence_version_blocks_approval_and_prompt_persists(self):
        store = GeoStore()
        headers = {'X-GEO-TOKEN':'test'}
        with TestClient(create_app(store=store, chat=FakeChat(), internal_token='test', demo=True)) as client:
            client.post('/monitor', headers=headers, json={'run_id':'r','query':'儿科','brand':{'name':'医院'}})
            draft = client.post('/content', headers=headers, json={'run_id':'r','text':'草稿','actor':'writer','evidence_ids':['demo-pediatrics-campus']}).json()
            client.post('/documents', headers=headers, json={'id':'demo-pediatrics-campus','title':'new','text':'new evidence','owner':'writer','version':2})
            client.post('/documents/demo-pediatrics-campus/review', headers=headers, json={'reviewer':'r','approve':True})
            self.assertEqual(client.post('/content/'+draft['id']+'/approve', headers=headers, json={'reviewer':'reviewer'}).status_code, 409)
            self.assertEqual(client.post('/prompts', headers=headers, json={'query':'儿科','brand':'医院','actor':'writer'}).status_code, 200)
            self.assertEqual(len(client.get('/prompts', headers=headers).json()), 1)
            self.assertEqual(client.get('/dashboard', headers=headers).json()['citation_rate'], None)
        store.close()
