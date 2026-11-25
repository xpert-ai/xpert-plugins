from __future__ import annotations

import math
import re
import time
from collections import Counter, defaultdict, deque, OrderedDict
from threading import RLock
from typing import Callable

from .domain import Evidence, FAQItem, KnowledgeDocument
from .knowledge import KnowledgeCatalog


_WORD_RE = re.compile(r"[\u4e00-\u9fff]+|[a-z0-9]+", re.IGNORECASE)
_SENTENCE_RE = re.compile(r"(?<=[。！？.!?；;])\s*")


def terms(text: str) -> tuple[str, ...]:
    """Use Chinese bigrams and ASCII words without a tokenizer service."""
    result: list[str] = []
    for match in _WORD_RE.findall(text.lower()):
        if "\u4e00" <= match[0] <= "\u9fff":
            result.extend(match[i : i + 2] for i in range(max(1, len(match) - 1)))
        elif len(match) > 1:
            result.append(match)
    return tuple(result)


def _tokenize(text: str) -> list[str]:
    """Tokenize for FAQ matching \u2014 keeps full words and short Chinese phrases."""
    tokens: list[str] = []
    for match in _WORD_RE.findall(text.lower()):
        if "\u4e00" <= match[0] <= "\u9fff":
            if len(match) >= 2:
                tokens.extend(match[i:i+2] for i in range(len(match) - 1))
        else:
            tokens.append(match)
    return tokens


def _bm25_scores(query: str, documents: tuple[KnowledgeDocument, ...]) -> dict[str, float]:
    if not documents:
        return {}
    tokenized = {d.id: terms(f"{d.title} {d.text}") for d in documents}
    query_terms = set(terms(query))
    if not query_terms:
        return {}
    avg_length = sum(len(t) for t in tokenized.values()) / len(documents)
    document_frequency = Counter(term for ts in tokenized.values() for term in set(ts))
    scores: dict[str, float] = {}
    for doc_id, doc_terms in tokenized.items():
        frequency = Counter(doc_terms)
        length_norm = 1.2 * (0.25 + 0.75 * len(doc_terms) / max(avg_length, 1))
        score = 0.0
        for term in query_terms:
            count = frequency[term]
            if count:
                idf = math.log(1 + (len(documents) - document_frequency[term] + 0.5) / (document_frequency[term] + 0.5))
                score += idf * (count * 2.2) / (count + length_norm)
        if score > 0:
            scores[doc_id] = score
    return scores


def _char_scores(query: str, documents: tuple[KnowledgeDocument, ...]) -> dict[str, float]:
    query_set = set(terms(query))
    if not query_set:
        return {}
    result: dict[str, float] = {}
    for document in documents:
        doc_set = set(terms(f"{document.title} {document.text}"))
        common = len(query_set & doc_set)
        if common:
            result[document.id] = common / math.sqrt(len(query_set) * max(len(doc_set), 1))
    return result


def _graph_scores(query: str, catalog: KnowledgeCatalog, max_hops: int = 2) -> tuple[dict[str, float], dict[str, tuple[str, ...]]]:
    edges = catalog.approved_edges()
    known_entities = {entity for doc in catalog.approved_documents() for entity in doc.entities}
    known_entities.update(entity for edge in edges for entity in (edge.source, edge.target))
    seeds = {entity for entity in known_entities if entity and entity.lower() in query.lower()}
    if not seeds:
        return {}, {}

    adjacency: dict[str, list[tuple[str, str, str]]] = defaultdict(list)
    for edge in edges:
        adjacency[edge.source].append((edge.target, edge.relation, edge.document_id))
        adjacency[edge.target].append((edge.source, edge.relation, edge.document_id))

    scores: dict[str, float] = defaultdict(float)
    paths: dict[str, tuple[str, ...]] = {}
    queue = deque((seed, 0, (seed,)) for seed in sorted(seeds))
    visited = {(seed, 0) for seed in seeds}
    while queue:
        entity, depth, path = queue.popleft()
        if depth >= max_hops:
            continue
        for neighbor, relation, document_id in adjacency.get(entity, ()):
            next_path = (*path, relation, neighbor)
            score = 1 / (depth + 1)
            if score > scores[document_id]:
                scores[document_id] = score
                paths[document_id] = next_path
            key = (neighbor, depth + 1)
            if key not in visited:
                visited.add(key)
                queue.append((neighbor, depth + 1, next_path))
    for document in catalog.approved_documents():
        if seeds.intersection(document.entities):
            scores[document.id] = max(scores[document.id], 0.7)
            paths.setdefault(document.id, tuple(sorted(seeds.intersection(document.entities))))
    return dict(scores), paths


def _ranked(scores: dict[str, float]) -> list[str]:
    return [document_id for document_id, score in sorted(scores.items(), key=lambda item: (-item[1], item[0])) if score > 0]


def _excerpt(document: KnowledgeDocument, query: str, max_chars: int, summarizer: Callable[[str, str], str] | None) -> str:
    text = document.text.strip()
    if len(text) <= max_chars:
        return text
    if summarizer is not None and len(text) > 2500:
        candidate = summarizer(query, text).strip()
        if candidate and len(candidate) <= max_chars:
            return candidate
    query_terms = set(terms(query))
    sentences = [s.strip() for s in _SENTENCE_RE.split(text) if s.strip()]
    scored = [(len(query_terms.intersection(terms(sentence))), index, sentence) for index, sentence in enumerate(sentences)]
    chosen = sorted(sorted(scored, key=lambda item: (-item[0], item[1]))[:3], key=lambda item: item[1])
    excerpt = " ".join(sentence for _, _, sentence in chosen)
    return excerpt[:max_chars]


class RetrievalEngine:
    def __init__(
        self,
        catalog: KnowledgeCatalog,
        *,
        cache_ttl_seconds: int = 300,
        max_context_chars: int = 1800,
        summarizer: Callable[[str, str], str] | None = None,
    ) -> None:
        self.catalog = catalog
        self.cache_ttl_seconds = cache_ttl_seconds
        self.max_context_chars = max_context_chars
        self.summarizer = summarizer
        self._cache = OrderedDict()
        self.cache_capacity = 512
        self._lock = RLock()

    def retrieve(self, query: str, *, top_k: int = 4, use_graph: bool = True) -> list[Evidence]:
        if not 3 <= top_k <= 5:
            raise ValueError("top_k must be between 3 and 5")
        clean_query = query.strip()[:1000]
        if not clean_query:
            return []
        revision = self.catalog.revision
        cache_key = (clean_query, top_k, use_graph, revision)
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached and cached[0] > time.monotonic():
                self._cache.move_to_end(cache_key)
                return list(cached[1])
            if cached:
                del self._cache[cache_key]

        documents = self.catalog.approved_documents()
        bm25 = _bm25_scores(clean_query, documents)
        char = _char_scores(clean_query, documents)
        graph, paths = _graph_scores(clean_query, self.catalog) if use_graph else ({}, {})
        fused: dict[str, float] = defaultdict(float)
        for weight, scores in ((1.0, bm25), (0.75, char), (1.2, graph)):
            for rank, document_id in enumerate(_ranked(scores), start=1):
                fused[document_id] += weight / (60 + rank)

        ranked = sorted(documents, key=lambda doc: (-fused.get(doc.id, 0), doc.id))
        remaining = self.max_context_chars
        evidence: list[Evidence] = []
        for document in ranked:
            if len(evidence) >= top_k or fused.get(document.id, 0) <= 0 or remaining < 80:
                break
            excerpt = _excerpt(document, clean_query, min(remaining, 500), self.summarizer)
            if not excerpt:
                continue
            evidence.append(Evidence(document.id, document.title, excerpt, fused[document.id], paths.get(document.id, ())))
            remaining -= len(excerpt)

        with self._lock:
            now = time.monotonic()
            for key in [key for key, value in self._cache.items() if value[0] <= now]:
                del self._cache[key]
            self._cache[cache_key] = (now + self.cache_ttl_seconds, tuple(evidence))
            self._cache.move_to_end(cache_key)
            while len(self._cache) > self.cache_capacity:
                self._cache.popitem(last=False)
        return evidence


class FAQRetriever:
    """BM25-based FAQ retrieval against approved FAQ questions."""

    def __init__(self, faqs: list[FAQItem]) -> None:
        self._faqs = [f for f in faqs if f.status == "approved"]
        self._index: dict[str, list[tuple[int, int]]] = {}
        for idx, faq in enumerate(self._faqs):
            tokens = _tokenize(faq.question)
            for token in tokens:
                self._index.setdefault(token, []).append((idx, tokens.count(token)))

    def search(self, query: str, top_k: int = 3) -> list[tuple[FAQItem, float]]:
        if not self._faqs or not query.strip():
            return []
        query_tokens = list(dict.fromkeys(_tokenize(query)))
        if not query_tokens:
            return []
        scores: list[float] = [0.0] * len(self._faqs)
        for token in query_tokens:
            postings = self._index.get(token, [])
            idf = math.log(1 + (len(self._faqs) - len(postings) + 0.5) / (len(postings) + 0.5))
            for idx, tf in postings:
                k1, b = 2.2, 0.75
                doc_len = len(_tokenize(self._faqs[idx].question))
                avg_len = max(1, sum(len(_tokenize(f.question)) for f in self._faqs) // len(self._faqs))
                scores[idx] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * doc_len / avg_len))
        ranked = sorted(enumerate(scores), key=lambda x: -x[1])
        return [(self._faqs[idx], score) for idx, score in ranked[:top_k] if score > 0]

