from __future__ import annotations

from dataclasses import replace
from threading import RLock

from .domain import DocumentStatus, FAQItem, KnowledgeDocument, KnowledgeEdge
from .errors import NotFound


class KnowledgeCatalog:
    """A governed in-process catalog. Only approved documents can be retrieved."""

    def __init__(self) -> None:
        self._documents: dict[str, KnowledgeDocument] = {}
        self._edges: list[KnowledgeEdge] = []
        self._revision = 0
        self._lock = RLock()

    @classmethod
    def from_snapshot(
        cls, documents: list[KnowledgeDocument], edges: list[KnowledgeEdge]
    ) -> KnowledgeCatalog:
        catalog = cls()
        catalog._documents = {document.id: document for document in documents}
        approved = {document.id for document in documents if document.status is DocumentStatus.APPROVED}
        catalog._edges = [edge for edge in edges if edge.document_id in approved]
        catalog._revision = len(documents) + len(catalog._edges)
        return catalog

    @property
    def revision(self) -> int:
        with self._lock:
            return self._revision

    def submit(self, document: KnowledgeDocument) -> KnowledgeDocument:
        if not document.id.strip() or not document.text.strip():
            raise ValueError("Document id and text are required")
        if document.status is not DocumentStatus.DRAFT:
            raise ValueError("New documents must enter as drafts")
        with self._lock:
            previous = self._documents.get(document.id)
            if previous and document.version <= previous.version:
                raise ValueError("Document version must increase")
            if previous:
                self._edges = [edge for edge in self._edges if edge.document_id != document.id]
            self._documents[document.id] = document
            self._revision += 1
        return document

    def decide(self, document_id: str, *, reviewer: str, approve: bool) -> KnowledgeDocument:
        if not reviewer.strip():
            raise ValueError("Reviewer identity is required")
        with self._lock:
            document = self.document(document_id)
            if document.status is not DocumentStatus.DRAFT:
                raise ValueError("Only draft documents can be reviewed")
            updated = replace(
                document,
                status=DocumentStatus.APPROVED if approve else DocumentStatus.REJECTED,
                approved_by=reviewer if approve else None,
            )
            self._documents[document_id] = updated
            self._revision += 1
            return updated

    def add_edge(self, edge: KnowledgeEdge) -> None:
        if not all((edge.source.strip(), edge.relation.strip(), edge.target.strip())):
            raise ValueError("Graph edge fields are required")
        with self._lock:
            document = self._documents.get(edge.document_id)
            if not document or document.status is not DocumentStatus.APPROVED:
                raise ValueError("Graph edges require an approved source document")
            if edge not in self._edges:
                self._edges.append(edge)
                self._revision += 1

    def approved_documents(self) -> tuple[KnowledgeDocument, ...]:
        with self._lock:
            return tuple(d for d in self._documents.values() if d.status is DocumentStatus.APPROVED)

    def approved_edges(self) -> tuple[KnowledgeEdge, ...]:
        with self._lock:
            approved_ids = {d.id for d in self._documents.values() if d.status is DocumentStatus.APPROVED}
            return tuple(e for e in self._edges if e.document_id in approved_ids)

    def document(self, document_id: str) -> KnowledgeDocument:
        with self._lock:
            document = self._documents.get(document_id)
            if document is None:
                raise NotFound("Document not found")
            return document

    def snapshot(self) -> KnowledgeCatalog:
        with self._lock:
            return KnowledgeCatalog.from_snapshot(list(self._documents.values()), list(self._edges))


class FAQCatalog:
    """A governed in-process catalog for FAQ items. Only approved FAQs are searchable."""

    def __init__(self) -> None:
        self._faqs: dict[str, FAQItem] = {}
        self._lock = RLock()
        self._retriever = None
        self._retriever_cache_key: int | None = None

    @classmethod
    def from_list(cls, faqs: list[FAQItem]) -> FAQCatalog:
        catalog = cls()
        catalog._faqs = {f.id: f for f in faqs}
        return catalog

    def _invalidate_retriever(self) -> None:
        self._retriever = None
        self._retriever_cache_key = None

    def submit(self, faq: FAQItem) -> FAQItem:
        if not faq.id.strip() or not faq.question.strip() or not faq.answer.strip():
            raise ValueError("FAQ id, question, and answer are required")
        if faq.status != "draft":
            raise ValueError("New FAQs must enter as drafts")
        with self._lock:
            self._faqs[faq.id] = faq
            self._invalidate_retriever()
        return faq

    def decide(self, faq_id: str, approve: bool) -> FAQItem:
        with self._lock:
            faq = self.faq(faq_id)
            if faq.status != "draft":
                raise ValueError("Only draft FAQs can be reviewed")
            from dataclasses import replace
            updated = replace(faq, status="approved" if approve else "rejected")
            self._faqs[faq_id] = updated
            self._invalidate_retriever()
            return updated

    def faq(self, faq_id: str) -> FAQItem:
        with self._lock:
            faq = self._faqs.get(faq_id)
            if faq is None:
                raise NotFound("FAQ not found")
            return faq

    def approved_faqs(self) -> tuple[FAQItem, ...]:
        with self._lock:
            return tuple(f for f in self._faqs.values() if f.status == "approved")

    def search(self, query: str, top_k: int = 3) -> list[tuple[FAQItem, float]]:
        from .retrieval import FAQRetriever
        cache_key = len(self.approved_faqs())
        if self._retriever is None or self._retriever_cache_key != cache_key:
            with self._lock:
                if self._retriever is None or self._retriever_cache_key != cache_key:
                    self._retriever = FAQRetriever(list(self.approved_faqs()))
                    self._retriever_cache_key = cache_key
        return self._retriever.search(query, top_k=top_k)
