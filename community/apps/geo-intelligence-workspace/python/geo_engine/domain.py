from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Annotated, Literal, TypedDict


class DocumentStatus(StrEnum):
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"


def _trace_reducer(existing: list[str], update: list[str]) -> list[str]:
    """LangGraph reducer: append new trace entries to the existing list."""
    return list(existing) + list(update)


@dataclass(frozen=True)
class KnowledgeDocument:
    id: str
    title: str
    text: str
    entities: tuple[str, ...]
    status: DocumentStatus = DocumentStatus.DRAFT
    version: int = 1
    owner: str = "demo"
    approved_by: str | None = None


@dataclass(frozen=True)
class KnowledgeEdge:
    source: str
    relation: str
    target: str
    document_id: str


@dataclass(frozen=True)
class Evidence:
    document_id: str
    title: str
    excerpt: str
    score: float
    paths: tuple[str, ...] = ()


@dataclass(frozen=True)
class ModelResponse:
    text: str
    model: str
    source_urls: tuple[str, ...] = ()
    input_tokens: int | None = None
    output_tokens: int | None = None


@dataclass(frozen=True)
class BrandProfile:
    name: str
    aliases: tuple[str, ...] = ()
    competitors: tuple[str, ...] = ()


@dataclass(frozen=True)
class AnswerMetrics:
    brand_mentioned: bool
    competitor_mentions: tuple[str, ...]
    brand_evidence: str | None
    citations_available: bool
    citation_urls: tuple[str, ...]
    faq_matched: bool = False
    faq_consistency: float = 0.0
    faq_has_contradiction: bool = False
    faq_matched_id: str | None = None
    sentiment_polarity: str = "neutral"
    sentiment_score: float = 0.0


class GeoState(TypedDict, total=False):
    mode: Literal["monitor", "knowledge"]
    query: str
    resolved_query: str
    history: list[dict[str, str]]
    brand: BrandProfile
    route: Literal["monitor", "hybrid", "graph"]
    raw_response: ModelResponse
    evidence: list[Evidence]
    metrics: AnswerMetrics
    answer: str
    suggestion: str
    status: Literal["ok", "insufficient_evidence", "needs_review", "failed"]
    error: str
    run_id: str
    trace: Annotated[list[str], _trace_reducer]


@dataclass(frozen=True)
class RunRecord:
    run_id: str
    query: str
    brand: str
    model: str
    raw_answer: str
    metrics: AnswerMetrics
    evidence_ids: tuple[str, ...]
    suggestion: str
    status: str
    sources: tuple[str, ...] = field(default_factory=tuple)
    retry_of: str | None = None
    error_code: str | None = None
    aliases: tuple[str, ...] = ()
    competitors: tuple[str, ...] = ()
    created_at: str = ""
    input_tokens: int | None = None
    output_tokens: int | None = None
    trace: tuple[str, ...] = ()
    evidence_versions: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True)
class ContentVersion:
    id: str
    run_id: str
    text: str
    status: Literal["draft", "approved"] = "draft"
    approved_by: str | None = None
    previous_version_id: str | None = None
    actor: str = ""
    evidence_ids: tuple[str, ...] = ()
    evidence_versions: tuple[tuple[str, int], ...] = ()


@dataclass(frozen=True)
class FAQItem:
    id: str
    question: str
    answer: str
    category: str = "综合"
    keywords: tuple[str, ...] = ()
    status: Literal["draft", "approved"] = "draft"
    created_by: str = "system"


@dataclass(frozen=True)
class FAQCheckResult:
    matched_faq_id: str | None
    consistency_score: float
    has_contradiction: bool
    matched_keywords: tuple[str, ...] = ()


@dataclass(frozen=True)
class SentimentResult:
    polarity: Literal["positive", "negative", "neutral"]
    score: float
    positive_words: tuple[str, ...] = ()
    negative_words: tuple[str, ...] = ()
