from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from langgraph.graph import END, START, StateGraph

from .analysis import check_answer_against_faqs, measure_answer, analyze_sentiment
from .domain import Evidence, FAQItem, GeoState, ModelResponse, SentimentResult
from .errors import GeoError
from .knowledge import FAQCatalog, KnowledgeCatalog
from .llm import ChatClient
from .retrieval import RetrievalEngine
from .prompts import PROBE_SYSTEM, ANALYSIS_INSTRUCTIONS, ANSWER_INSTRUCTIONS


@dataclass(frozen=True)
class RoutingPolicy:
    """Injectable Chinese hospital-demo heuristics; not a universal intent classifier."""
    relationship_pattern: str = r"哪家|哪个院区|哪里|在哪|如何到|关联|转诊|先.+再|同时|流程.*院区"
    followup_pattern: str = r"^(那|这个|它|那里|上述|如果)"


def _evidence_context(evidence: list[Evidence]) -> str:
    return "\n".join(f"[{item.document_id}] {item.title}: {item.excerpt}" for item in evidence)


class GeoWorkflow:
    def __init__(
        self,
        chat: ChatClient,
        retrieval: RetrievalEngine,
        policy: RoutingPolicy | None = None,
        faq_catalog: FAQCatalog | None = None,
    ) -> None:
        self.chat = chat
        self.retrieval = retrieval
        self.faq_catalog = faq_catalog or FAQCatalog()
        policy = policy or RoutingPolicy()
        self.relationship = re.compile(policy.relationship_pattern)
        self.followup = re.compile(policy.followup_pattern)
        graph = StateGraph(GeoState)
        graph.add_node("route", self._route)
        graph.add_node("probe", self._probe)
        graph.add_node("retrieve", self._retrieve)
        graph.add_node("analyze", self._analyze)
        graph.add_node("answer", self._answer)
        graph.add_edge(START, "route")
        graph.add_conditional_edges("route", self._after_route, {"monitor": "probe", "knowledge": "retrieve"})
        graph.add_edge("probe", "retrieve")
        graph.add_conditional_edges("retrieve", self._after_retrieve, {"monitor": "analyze", "knowledge": "answer"})
        graph.add_edge("analyze", END)
        graph.add_edge("answer", END)
        self.graph = graph.compile()

    @staticmethod
    def _after_route(state: GeoState) -> Literal["monitor", "knowledge"]:
        return state["mode"]

    @staticmethod
    def _after_retrieve(state: GeoState) -> Literal["monitor", "knowledge"]:
        return state["mode"]

    def _route(self, state: GeoState) -> GeoState:
        query = state["query"].strip()
        if not query:
            raise GeoError("Question is required")
        if state["mode"] == "monitor":
            return {"route": "monitor", "resolved_query": query, "trace": ["route:monitor"]}
        history = state.get("history", [])[-4:]
        previous_questions = [item.get("content", "") for item in history if item.get("role") == "user"]
        resolved = f"{previous_questions[-1][:160]}；追问：{query}" if previous_questions and self.followup.search(query) else query
        route: Literal["hybrid", "graph"] = "graph" if self.relationship.search(resolved) else "hybrid"
        return {"route": route, "resolved_query": resolved[:400], "trace": [f"route:{route}"]}

    def _probe(self, state: GeoState) -> GeoState:
        # Monitoring must not receive hospital knowledge; otherwise the metric is biased.
        response = self.chat.complete(
            [
                {"role": "system", "content": PROBE_SYSTEM},
                {"role": "user", "content": state["query"]},
            ]
        )
        return {"raw_response": response, "trace": ["probe:complete"]}

    def _retrieve(self, state: GeoState) -> GeoState:
        try:
            evidence = self.retrieval.retrieve(
                state["resolved_query"],
                top_k=4,
                use_graph=state.get("route") == "graph" or state["mode"] == "monitor",
            )
        except Exception:
            evidence = []
        return {"evidence": evidence, "trace": [f"retrieve:{len(evidence)}"]}

    def _analyze(self, state: GeoState) -> GeoState:
        metrics = measure_answer(state["raw_response"], state["brand"])
        # FAQ check and sentiment analysis
        faq_results = self.faq_catalog.search(state["query"], top_k=3)
        approved_faqs = [item for item, _ in faq_results]
        faq_check = check_answer_against_faqs(state["raw_response"].text, approved_faqs)
        sentiment = analyze_sentiment(state["raw_response"].text)
        from dataclasses import replace
        metrics = replace(
            metrics,
            faq_matched=faq_check.matched_faq_id is not None,
            faq_consistency=faq_check.consistency_score,
            faq_has_contradiction=faq_check.has_contradiction,
            faq_matched_id=faq_check.matched_faq_id,
            sentiment_polarity=sentiment.polarity,
            sentiment_score=sentiment.score,
        )
        evidence = state.get("evidence", [])
        if not evidence:
            return {
                "metrics": metrics,
                "suggestion": "暂无已审核的医院资料，不能生成有依据的优化建议。",
                "status": "insufficient_evidence",
                "trace": ["analyze:abstain"],
            }
        prompt = (
            ANALYSIS_INSTRUCTIONS + "\n"
            f"用户问题：{state['query'][:400]}\n"
            f"DeepSeek 原始回答：{state['raw_response'].text[:1400]}\n"
            f"已审核证据：\n{_evidence_context(evidence)}"
        )
        suggestion = self.chat.complete([{"role": "user", "content": prompt}]).text.strip()
        # Citation markers are not semantic verification; all generated drafts need review.
        return {
            "metrics": metrics,
            "suggestion": suggestion[:2000],
            "status": "needs_review",
            "trace": ["analyze:needs_review"],
        }

    def _answer(self, state: GeoState) -> GeoState:
        evidence = state.get("evidence", [])
        if not evidence:
            return {
                "answer": "已审核资料中没有足够依据回答这个问题，请向医院官方渠道核实。",
                "status": "insufficient_evidence",
                "trace": ["answer:abstain"],
            }
        recent_history = state.get("history", [])
        overflow = recent_history[:-4]
        recent = recent_history[-4:]
        if overflow:
            earlier_questions = [item.get("content", "")[:60] for item in overflow if item.get("role") == "user"]
            summary = "早期对话摘要：" + "；".join(earlier_questions)
        else:
            summary = ""
        history_text = "\n".join(f"{item.get('role', '')}: {item.get('content', '')[:250]}" for item in recent)
        prompt = (
            ANSWER_INSTRUCTIONS + "\n"
            f"{summary}\n"
            f"最近对话：{history_text[:700]}\n问题：{state['resolved_query'][:400]}\n"
            f"证据：\n{_evidence_context(evidence)}"
        )
        response: ModelResponse = self.chat.complete([{"role": "user", "content": prompt}])
        valid = any(f"[{item.document_id}]" in response.text for item in evidence)
        return {
            "answer": response.text[:2500] if valid else "回答缺少可核对的证据标记，已转人工复核。",
            "status": "needs_review",
            "trace": ["answer:citation_present" if valid else "answer:needs_review"],
        }

    def invoke(self, state: GeoState) -> GeoState:
        return self.graph.invoke(state)

