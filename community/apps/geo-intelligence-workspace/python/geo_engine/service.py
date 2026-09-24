"""Application orchestration separated from transport and model adapters."""
from threading import RLock

from .knowledge import FAQCatalog, KnowledgeCatalog
from .retrieval import RetrievalEngine
from .workflow import GeoWorkflow


class WorkflowFactory:
    """Reuse bounded retrieval caches; rebuild only when data_version changes."""
    def __init__(self, store, model):
        self.store, self.model = store, model
        self._lock = RLock()
        self._data_version = -1
        self._workflow = None

    def get(self):
        version = self.store.get_data_version()
        if version == self._data_version and self._workflow is not None:
            return self._workflow
        with self._lock:
            if version == self._data_version and self._workflow is not None:
                return self._workflow
            documents, edges = self.store.load_documents(), self.store.load_edges()
            catalog = KnowledgeCatalog.from_snapshot(documents, edges)
            faq_catalog = FAQCatalog.from_list(self.store.list_faqs(status="approved"))
            self._workflow = GeoWorkflow(self.model, RetrievalEngine(catalog), faq_catalog=faq_catalog)
            self._data_version = version
            return self._workflow


def dashboard(runs):
    completed = [run for run in runs if run.status != "failed"]
    mentions = sum(run.metrics.brand_mentioned for run in completed)
    return {
        "sample_size": len(runs), "completed": len(completed),
        "failed": len(runs) - len(completed),
        "brand_mention_rate": mentions / len(completed) if completed else None,
        "citation_rate": None,
        "citation_note": "Standard DeepSeek chat has no verifiable citation metadata",
        "scope": "latest 500 runs; API observations, not consumer website rankings",
    }
