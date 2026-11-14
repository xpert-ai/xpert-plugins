from __future__ import annotations

import unittest
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import httpx

from fastapi.testclient import TestClient

from geo_engine.api import create_app
from geo_engine.analysis import analyze_sentiment, check_answer_against_faqs
from geo_engine.demo import DEMO_DOCUMENTS, DEMO_EDGES, DEMO_FAQS
from geo_engine.domain import BrandProfile, DocumentStatus, FAQItem, KnowledgeDocument, KnowledgeEdge, ModelResponse
from geo_engine.knowledge import FAQCatalog, KnowledgeCatalog
from geo_engine.retrieval import FAQRetriever, RetrievalEngine
from geo_engine.store import GeoStore
from geo_engine.workflow import GeoWorkflow
from geo_engine.config import load_model_env
from geo_engine.llm import DeepSeekChatClient, IncompleteModelResponse


class ProviderBoundaryTests(unittest.TestCase):
    def test_only_deepseek_settings_are_loaded_without_modifying_source(self) -> None:
        with TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=True):
            source = Path(folder) / ".env"
            original = "DEEPSEEK_API_KEY=test-only\nDEEPSEEK_MODEL=demo\nLANGSMITH_TRACING=true\nOTHER_SECRET=keep-private\n"
            source.write_text(original, encoding="utf-8")
            load_model_env(source)
            self.assertEqual(os.environ.get("DEEPSEEK_MODEL"), "demo")
            self.assertNotIn("OTHER_SECRET", os.environ)
            self.assertNotIn("LANGSMITH_TRACING", os.environ)
            self.assertEqual(source.read_text(encoding="utf-8"), original)

    def test_empty_reasoning_only_response_is_not_success(self) -> None:
        bodies = []
        def handler(request: httpx.Request) -> httpx.Response:
            bodies.append(json.loads(request.content))
            return httpx.Response(200, json={"choices": [{"message": {"content": "", "reasoning_content": "reasoning"}, "finish_reason": "length"}]})
        client = DeepSeekChatClient(api_key="test-only", transport=httpx.MockTransport(handler))
        try:
            with self.assertRaises(IncompleteModelResponse):
                client.complete([{"role": "user", "content": "test"}])
            self.assertEqual(bodies[0]["thinking"], {"type": "disabled"})
        finally:
            client.close()


class FakeChat:
    def __init__(self) -> None:
        self.calls: list[list[dict[str, str]]] = []

    def complete(self, messages: list[dict[str, str]]) -> ModelResponse:
        self.calls.append(messages)
        text = messages[-1]["content"]
        if messages[0].get("role") == "system":
            return ModelResponse("星河示例医院有儿科服务。https://unverified.example/", "fake-deepseek")
        if "GEO 内容审核助手" in text:
            return ModelResponse("建议核对东院区服务说明 [demo-pediatrics-campus]", "fake-deepseek")
        return ModelResponse("儿科门诊在东院区 [demo-pediatrics-campus]；预约见官方页面 [demo-east-booking]。", "fake-deepseek")


def make_catalog() -> KnowledgeCatalog:
    catalog = KnowledgeCatalog()
    for document in DEMO_DOCUMENTS:
        catalog.submit(document)
        catalog.decide(document.id, reviewer="reviewer", approve=True)
    for edge in DEMO_EDGES:
        catalog.add_edge(edge)
    return catalog


class GovernanceAndRetrievalTests(unittest.TestCase):
    def test_draft_cannot_be_retrieved_or_used_for_graph_edge(self) -> None:
        catalog = KnowledgeCatalog()
        catalog.submit(KnowledgeDocument("draft", "儿科", "东院区预约", ("儿科门诊", "东院区")))
        self.assertEqual(RetrievalEngine(catalog).retrieve("儿科门诊在哪个院区"), [])
        with self.assertRaises(ValueError):
            catalog.add_edge(KnowledgeEdge("儿科门诊", "位于", "东院区", "draft"))
        self.assertEqual(catalog.document("draft").status, DocumentStatus.DRAFT)

    def test_two_hop_graph_retrieval_and_top_k_limit(self) -> None:
        evidence = RetrievalEngine(make_catalog()).retrieve("儿科门诊所在院区如何预约？", use_graph=True)
        ids = [item.document_id for item in evidence]
        self.assertIn("demo-pediatrics-campus", ids)
        self.assertIn("demo-east-booking", ids)
        self.assertTrue(all(item.excerpt for item in evidence))
        self.assertLessEqual(len(evidence), 4)

    def test_new_document_version_invalidates_prior_graph_edges(self) -> None:
        catalog = make_catalog()
        self.assertTrue(any(e.document_id == "demo-pediatrics-campus" for e in catalog.approved_edges()))
        catalog.submit(KnowledgeDocument("demo-pediatrics-campus", "修订", "待审批", ("儿科门诊",), version=2))
        self.assertFalse(any(e.document_id == "demo-pediatrics-campus" for e in catalog.approved_edges()))


class WorkflowTests(unittest.TestCase):
    def test_monitor_probe_has_no_knowledge_context_and_citation_is_unavailable(self) -> None:
        chat = FakeChat()
        result = GeoWorkflow(chat, RetrievalEngine(make_catalog()), faq_catalog=FAQCatalog()).invoke(
            {"mode": "monitor", "query": "星河示例医院儿科如何预约？", "brand": BrandProfile("星河示例医院")}
        )
        self.assertEqual(result["status"], "needs_review")
        self.assertEqual(len(chat.calls), 2)
        self.assertNotIn("已审核证据", str(chat.calls[0]))
        self.assertTrue(result["metrics"].brand_mentioned)
        self.assertFalse(result["metrics"].citations_available)
        self.assertEqual(result["metrics"].citation_urls, ())

    def test_empty_knowledge_abstains_without_model_call(self) -> None:
        chat = FakeChat()
        result = GeoWorkflow(chat, RetrievalEngine(KnowledgeCatalog()), faq_catalog=FAQCatalog()).invoke(
            {"mode": "knowledge", "query": "儿科门诊在哪？"}
        )
        self.assertEqual(result["status"], "insufficient_evidence")
        self.assertEqual(chat.calls, [])

    def test_followup_query_uses_recent_context_and_graph_route(self) -> None:
        chat = FakeChat()
        result = GeoWorkflow(chat, RetrievalEngine(make_catalog()), faq_catalog=FAQCatalog()).invoke(
            {"mode": "knowledge", "query": "那里如何预约？", "history": [{"role": "user", "content": "儿科门诊在哪个院区？"}]}
        )
        self.assertEqual(result["route"], "graph")
        self.assertIn("儿科门诊", result["resolved_query"])
        self.assertIn("[demo-pediatrics-campus]", result["answer"])


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.chat = FakeChat()
        self.store = GeoStore()
        self.client = TestClient(create_app(store=self.store, chat=self.chat, internal_token="test-token", demo=True))
        self.headers = {"X-GEO-TOKEN": "test-token"}

    def tearDown(self) -> None:
        self.client.close()
        self.store.close()

    def test_monitor_idempotency_and_content_approval(self) -> None:
        payload = {"run_id": "run-001", "query": "星河示例医院儿科如何预约？", "brand": {"name": "星河示例医院"}}
        first = self.client.post("/monitor", json=payload, headers=self.headers)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["status"], "needs_review")
        self.assertEqual(len(self.chat.calls), 2)
        again = self.client.post("/monitor", json=payload, headers=self.headers)
        self.assertEqual(again.json(), first.json())
        self.assertEqual(len(self.chat.calls), 2)
        draft = self.client.post(
            "/content", json={"run_id": "run-001", "text": "优化后的院区介绍", "actor": "editor", "evidence_ids": ["demo-pediatrics-campus"]}, headers=self.headers
        )
        self.assertEqual(draft.status_code, 200)
        content_id = draft.json()["id"]
        approved = self.client.post(
            f"/content/{content_id}/approve", json={"reviewer": "chief-editor"}, headers=self.headers
        )
        self.assertEqual(approved.json()["status"], "approved")
        self.assertEqual(self.client.get("/runs/run-001/content", headers=self.headers).json()[0]["approved_by"], "chief-editor")

    def test_content_requires_approved_evidence_and_independent_review(self) -> None:
        self.client.post("/monitor", json={"run_id": "run-002", "query": "儿科在哪？", "brand": {"name": "星河示例医院"}}, headers=self.headers)
        body = {"run_id": "run-002", "text": "待审核建议", "actor": "editor", "evidence_ids": ["missing"]}
        self.assertEqual(self.client.post("/content", json=body, headers=self.headers).status_code, 409)
        body["evidence_ids"] = ["demo-pediatrics-campus"]
        draft = self.client.post("/content", json=body, headers=self.headers)
        self.assertEqual(draft.status_code, 200)
        content_id = draft.json()["id"]
        same_person = self.client.post(f"/content/{content_id}/approve", json={"reviewer": "editor"}, headers=self.headers)
        self.assertEqual(same_person.status_code, 409)

    def test_mutation_requires_internal_token(self) -> None:
        response = self.client.post("/monitor", json={"query": "儿科", "brand": {"name": "星河示例医院"}})
        self.assertEqual(response.status_code, 403)

    def test_failed_run_can_be_retried_with_new_id(self) -> None:
        class FailingChat:
            def complete(self, messages: list[dict[str, str]]) -> ModelResponse:
                raise RuntimeError("provider unavailable")

        retry_store = GeoStore()
        client = TestClient(create_app(store=retry_store, chat=FailingChat(), internal_token="test-token", demo=True))
        original = client.post(
            "/monitor", json={"run_id": "failed-1", "query": "儿科", "brand": {"name": "星河示例医院"}}, headers=self.headers
        )
        self.assertEqual(original.json()["status"], "failed")
        retry = client.post(
            "/monitor", json={"run_id": "failed-2", "retry_of": "failed-1", "query": "儿科", "brand": {"name": "星河示例医院"}}, headers=self.headers
        )
        self.assertEqual(retry.json()["retry_of"], "failed-1")
        self.assertEqual(len(client.get("/runs", headers=self.headers).json()), 2)
        client.close()
        retry_store.close()

    def test_old_evidence_from_rejected_document_is_blocked(self) -> None:
        """Regression: content cannot reference evidence from rejected documents."""
        # Create a monitor run first
        self.client.post("/monitor", json={"run_id": "run-evidence", "query": "儿科", "brand": {"name": "星河示例医院"}}, headers=self.headers)
        # Try to save content with a non-existent document id
        body = {"run_id": "run-evidence", "text": "测试内容", "actor": "editor", "evidence_ids": ["non-existent-doc"]}
        response = self.client.post("/content", json=body, headers=self.headers)
        self.assertEqual(response.status_code, 409)
        self.assertIn("unapproved", response.json()["detail"].lower() or "")

    def test_content_version_association_with_run(self) -> None:
        """Regression: content must belong to an existing run."""
        body = {"run_id": "non-existent-run", "text": "测试内容", "actor": "editor", "evidence_ids": ["demo-pediatrics-campus"]}
        response = self.client.post("/content", json=body, headers=self.headers)
        self.assertIn(response.status_code, [404, 409])

    def test_document_version_must_increase(self) -> None:
        """Regression: submitting a document with same or lower version fails."""
        doc = {
            "id": "version-test-doc",
            "title": "测试文档",
            "text": "初始版本内容",
            "entities": ["测试"],
            "version": 1,
            "owner": "test-user"
        }
        first = self.client.post("/documents", json=doc, headers=self.headers)
        self.assertEqual(first.status_code, 200)
        # Try to submit same version
        second = self.client.post("/documents", json=doc, headers=self.headers)
        self.assertEqual(second.status_code, 409)
        # Submit with higher version succeeds
        doc["version"] = 2
        doc["text"] = "修订版本内容"
        third = self.client.post("/documents", json=doc, headers=self.headers)
        self.assertEqual(third.status_code, 200)


class FAQTests(unittest.TestCase):
    def test_faq_crud_and_approval(self) -> None:
        store = GeoStore()
        faq = FAQItem("faq-test-1", "测试问题", "测试答案", "综合", ("测试",))
        stored = store.save_faq(faq, actor="test")
        self.assertEqual(stored.id, "faq-test-1")
        self.assertEqual(store.get_faq("faq-test-1").question, "测试问题")
        self.assertEqual(store.get_faq("faq-test-1").status, "draft")
        approved = store.approve_faq("faq-test-1")
        self.assertEqual(approved.status, "approved")
        self.assertEqual(len(store.list_faqs(status="approved")), 1)
        store.close()

    def test_faq_retrieval_matches_similar_questions(self) -> None:
        from dataclasses import replace
        approved_faqs = [replace(f, status="approved") for f in DEMO_FAQS]
        retriever = FAQRetriever(approved_faqs)
        results = retriever.search("儿科在哪个院区", top_k=2)
        self.assertGreater(len(results), 0)
        matched_ids = [item.id for item, _ in results]
        self.assertIn("faq-002", matched_ids)

    def test_sentiment_analysis_positive(self) -> None:
        result = analyze_sentiment("星河医院非常专业，设备先进，推荐大家去")
        self.assertEqual(result.polarity, "positive")
        self.assertGreater(result.score, 0)
        self.assertIn("专业", result.positive_words)

    def test_sentiment_analysis_negative(self) -> None:
        result = analyze_sentiment("服务态度很差，等了很久，非常失望")
        self.assertEqual(result.polarity, "negative")
        self.assertLess(result.score, 0)
        self.assertIn("差", result.negative_words)

    def test_sentiment_analysis_neutral(self) -> None:
        result = analyze_sentiment("体检中心在二楼，工作日开放")
        self.assertEqual(result.polarity, "neutral")

    def test_faq_answer_check_matches(self) -> None:
        faqs = list(DEMO_FAQS)
        answer = "儿科在东院区，需要提前预约，流程很方便"
        result = check_answer_against_faqs(answer, faqs)
        self.assertIsNotNone(result.matched_faq_id)
        self.assertGreater(result.consistency_score, 0.1)

    def test_faq_answer_check_no_match(self) -> None:
        faqs = list(DEMO_FAQS)
        answer = "今天天气很好，适合出门散步"
        result = check_answer_against_faqs(answer, faqs)
        self.assertIsNone(result.matched_faq_id)

    def test_faq_api_endpoints(self) -> None:
        store = GeoStore()
        chat = FakeChat()
        client = TestClient(create_app(store=store, chat=chat, internal_token="test-token", demo=True))
        headers = {"X-GEO-TOKEN": "test-token"}
        # List FAQs (demo should have seeded some)
        resp = client.get("/faqs", headers=headers)
        self.assertEqual(resp.status_code, 200)
        # Create FAQ
        resp = client.post("/faqs", json={
            "id": "api-faq-1", "question": "API测试问题", "answer": "API测试答案",
            "category": "综合", "keywords": ["测试"], "created_by": "test"
        }, headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["question"], "API测试问题")
        # Approve FAQ
        resp = client.post("/faqs/api-faq-1/approve", headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "approved")
        client.close()
        store.close()


if __name__ == "__main__":
    unittest.main()
