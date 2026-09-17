from __future__ import annotations

import json
import os
import secrets
import logging
import warnings
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from dataclasses import asdict
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from fastapi.responses import JSONResponse, FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from .errors import GeoError, IdempotencyConflict, ModelNotConfigured, ProviderUnavailable, RunInProgress

from .demo import seed_demo as load_demo
from .domain import AnswerMetrics, BrandProfile, ContentVersion, FAQItem, KnowledgeDocument, KnowledgeEdge, RunRecord
from .knowledge import FAQCatalog, KnowledgeCatalog
from .llm import ChatClient, DeepSeekChatClient, IncompleteModelResponse
from .retrieval import RetrievalEngine
from .store import GeoStore
from .workflow import GeoWorkflow
from .service import WorkflowFactory, dashboard


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class DocumentInput(InputModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=30000)
    entities: list[str] = Field(default_factory=list, max_length=100)
    version: int = Field(default=1, ge=1)
    owner: str = Field(min_length=1, max_length=100)


class EdgeInput(InputModel):
    source: str = Field(min_length=1, max_length=200)
    relation: str = Field(min_length=1, max_length=200)
    target: str = Field(min_length=1, max_length=200)


class ReviewInput(InputModel):
    reviewer: str = Field(min_length=1)
    approve: bool
    edges: list[EdgeInput] = Field(default_factory=list, max_length=100)


class BrandInput(InputModel):
    name: str = Field(min_length=1, max_length=100)
    aliases: list[str] = Field(default_factory=list, max_length=20)
    competitors: list[str] = Field(default_factory=list, max_length=20)


class MonitorInput(InputModel):
    query: str = Field(min_length=1, max_length=1000)
    brand: BrandInput
    run_id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    retry_of: str | None = None


class KnowledgeInput(InputModel):
    query: str = Field(min_length=1, max_length=1000)
    history: list[dict[str, str]] = Field(default_factory=list, max_length=8)


class ContentInput(InputModel):
    run_id: str
    text: str = Field(min_length=1, max_length=20000)
    actor: str = Field(min_length=1)
    previous_version_id: str | None = None
    evidence_ids: list[str] = Field(min_length=1, max_length=5)


class ContentReviewInput(InputModel):
    reviewer: str = Field(min_length=1)


class PromptInput(InputModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    query: str = Field(min_length=1, max_length=1000)
    brand: str = Field(min_length=1, max_length=100)
    actor: str = Field(min_length=1, max_length=100)


class AuthInput(InputModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class TaskInput(InputModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    brand: str = Field(min_length=1, max_length=100)
    queries: list[str] = Field(min_length=1, max_length=100)
    created_by: str = Field(min_length=1, max_length=100)


class EditTaskInput(InputModel):
    name: str | None = Field(default=None, max_length=200)
    brand: str | None = Field(default=None, max_length=100)
    queries: list[str] | None = Field(default=None, max_length=100)


class BatchMonitorInput(InputModel):
    queries: list[str] = Field(min_length=1, max_length=200)
    brand: BrandInput
    run_ids: list[str] | None = None


class FAQInput(InputModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=100)
    question: str = Field(min_length=1, max_length=1000)
    answer: str = Field(min_length=1, max_length=5000)
    category: str = Field(default="综合", max_length=50)
    keywords: list[str] = Field(default_factory=list, max_length=20)
    created_by: str = Field(default="system", max_length=100)


def create_app(
    *,
    store: GeoStore | None = None,
    chat: ChatClient | None = None,
    internal_token: str | None = None,
    demo: bool = False,
) -> FastAPI:
    owns_store, owns_model = store is None, chat is None
    if store is None:
        default_path = Path(__file__).resolve().parents[1] / "data" / "geo.sqlite3"
        database_path = os.environ.get("GEO_DB_PATH", str(default_path))
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        store = GeoStore(database_path)
    token = internal_token if internal_token is not None else os.environ.get("GEO_INTERNAL_TOKEN", "")
    catalog = KnowledgeCatalog.from_snapshot(store.load_documents(), store.load_edges())
    faq_catalog = FAQCatalog.from_list(store.list_faqs())
    if demo:
        load_demo(catalog, store, faq_catalog)
    model = chat or DeepSeekChatClient()
    workflows = WorkflowFactory(store, model)
    @asynccontextmanager
    async def lifespan(_app):
        yield
        if owns_model:
            model.close()
        if owns_store:
            store.close()

    app = FastAPI(title="Xpert GEO Engine", version="0.1.0", lifespan=lifespan)

    def require_token(x_geo_token: str | None = Header(default=None)) -> None:
        if not token:
            raise HTTPException(status_code=503, detail="GEO service token not configured")
        if not x_geo_token or not secrets.compare_digest(x_geo_token, token):
            raise HTTPException(status_code=403, detail="GEO service token missing or invalid")

    @app.exception_handler(GeoError)
    async def domain_error(_request, error: GeoError):
        return JSONResponse(status_code=error.status_code, content={"detail": str(error), "code": error.code})

    def current_catalog():
        with store.transaction():
            return KnowledgeCatalog.from_snapshot(store.load_documents(), store.load_edges())

    @app.get("/health")
    def health() -> dict[str, object]:
        return {"status": "ok", "approved_documents": len(catalog.approved_documents())}

    @app.post("/documents", dependencies=[Depends(require_token)])
    def submit_document(payload: DocumentInput) -> dict[str, object]:
        document = KnowledgeDocument(
            id=payload.id,
            title=payload.title,
            text=payload.text,
            entities=tuple(payload.entities),
            version=payload.version,
            owner=payload.owner,
        )
        try:
            with store.transaction():
                snapshot = current_catalog()
                snapshot.submit(document)
                store.save_document(document, actor=payload.owner)
        except GeoError:
            raise
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return asdict(document)

    @app.post("/documents/{document_id}/review", dependencies=[Depends(require_token)])
    def review_document(document_id: str, payload: ReviewInput) -> dict[str, object]:
        try:
            with store.transaction():
                snapshot = current_catalog()
                approved = snapshot.decide(document_id, reviewer=payload.reviewer, approve=payload.approve)
                edges = [KnowledgeEdge(item.source, item.relation, item.target, document_id) for item in payload.edges] if payload.approve else []
                for edge in edges:
                    snapshot.add_edge(edge)
                store.save_document(approved, actor=payload.reviewer)
                for edge in edges:
                    store.save_edge(edge, actor=payload.reviewer)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Document or edge field not found") from error
        except GeoError:
            raise
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return asdict(approved)

    @app.post("/monitor", dependencies=[Depends(require_token)])
    def monitor(payload: MonitorInput) -> dict[str, object]:
        if payload.retry_of and store.get_run(payload.retry_of) is None:
            raise HTTPException(status_code=404, detail="Original run not found")
        existing = store.claim_run(payload.run_id, payload.model_dump(exclude={"run_id"}))
        if existing:
            return asdict(existing)
        brand = BrandProfile(payload.brand.name, tuple(payload.brand.aliases), tuple(payload.brand.competitors))
        try:
            workflow = workflows.get()
            snapshot = workflow.retrieval.catalog
            state = workflow.invoke({"mode": "monitor", "query": payload.query, "brand": brand, "run_id": payload.run_id})
            raw = state["raw_response"]
            record = RunRecord(
                run_id=payload.run_id,
                query=payload.query,
                brand=brand.name,
                model=raw.model,
                raw_answer=raw.text,
                metrics=state["metrics"],
                evidence_ids=tuple(item.document_id for item in state.get("evidence", [])),
                suggestion=state.get("suggestion", ""),
                status=state.get("status", "needs_review"),
                sources=raw.source_urls,
                retry_of=payload.retry_of, aliases=brand.aliases, competitors=brand.competitors,
                created_at=datetime.now(timezone.utc).isoformat(),
                input_tokens=raw.input_tokens, output_tokens=raw.output_tokens,
                trace=tuple(state.get("trace", [])),
                evidence_versions=tuple((item.document_id, snapshot.document(item.document_id).version) for item in state.get("evidence", [])),
            )
        except GeoError:
            raise  # Let IdempotencyConflict / RunInProgress reach the domain_error handler
        except Exception as error:
            codes = {ModelNotConfigured: "model_not_configured", ProviderUnavailable: "provider_unavailable", IncompleteModelResponse: "incomplete_model_response"}
            error_code = next((code for kind, code in codes.items() if isinstance(error, kind)), "internal_error")
            if error_code == "internal_error":
                # Log classification and correlation only; exception text can contain secrets.
                logging.getLogger(__name__).error("Unexpected monitor error run=%s type=%s", payload.run_id, type(error).__name__)
            record = RunRecord(
                run_id=payload.run_id, query=payload.query, brand=brand.name,
                model="deepseek-chat", raw_answer="",
                metrics=AnswerMetrics(False, (), None, False, (), False, 0.0, False, None, "neutral", 0.0), evidence_ids=(),
                suggestion="", status="failed", retry_of=payload.retry_of, error_code=error_code,
            )
        return asdict(store.save_run(record))

    @app.get("/runs", dependencies=[Depends(require_token)])
    def list_runs(limit: int = 100) -> list[dict[str, object]]:
        return [asdict(run) for run in store.list_runs(limit=limit)]

    @app.get("/runs/{run_id}", dependencies=[Depends(require_token)])
    def get_run(run_id: str) -> dict[str, object]:
        record = store.get_run(run_id)
        if record is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return asdict(record)

    @app.post("/knowledge/ask", dependencies=[Depends(require_token)])
    def ask(payload: KnowledgeInput) -> dict[str, object]:
        try:
            state = workflows.get().invoke({"mode": "knowledge", "query": payload.query, "history": payload.history})
        except (ModelNotConfigured, ProviderUnavailable, IncompleteModelResponse) as error:
            raise HTTPException(status_code=502, detail="Model or retrieval service failed") from error
        return {
            "answer": state["answer"], "status": state["status"], "route": state["route"],
            "evidence": [asdict(item) for item in state.get("evidence", [])],
            "trace": state.get("trace", []),
        }

    @app.post("/content", dependencies=[Depends(require_token)])
    def save_content(payload: ContentInput) -> dict[str, object]:
        with store.transaction():
            run = store.get_run(payload.run_id)
            if run is None:
                raise HTTPException(status_code=404, detail="Run not found")
            snapshot = current_catalog()
            approved_ids = {document.id for document in snapshot.approved_documents()}
            if not set(payload.evidence_ids).issubset(approved_ids):
                raise HTTPException(status_code=409, detail="Content references unapproved evidence")
            versions = dict(run.evidence_versions)
            if any(versions.get(doc_id) != snapshot.document(doc_id).version for doc_id in payload.evidence_ids):
                raise HTTPException(status_code=409, detail="Evidence changed; rerun monitoring before saving")
            content = ContentVersion(
                id=str(uuid4()), run_id=payload.run_id, text=payload.text,
                previous_version_id=payload.previous_version_id,
                actor=payload.actor, evidence_ids=tuple(payload.evidence_ids),
                evidence_versions=tuple((doc_id, snapshot.document(doc_id).version) for doc_id in payload.evidence_ids),
            )
            try:
                return asdict(store.save_content(content, actor=payload.actor))
            except GeoError:
                raise
            except ValueError as error:
                raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/content/{content_id}/approve", dependencies=[Depends(require_token)])
    def approve_content(content_id: str, payload: ContentReviewInput) -> dict[str, object]:
        with store.transaction():
            current = store.get_content(content_id)
            if current is None:
                raise HTTPException(status_code=404, detail="Content not found")
            snapshot = current_catalog()
            approved_ids = {document.id for document in snapshot.approved_documents()}
            if not current.evidence_ids or not set(current.evidence_ids).issubset(approved_ids):
                raise HTTPException(status_code=409, detail="Content evidence is no longer approved")
            if not current.evidence_versions or any(snapshot.document(doc_id).version != version for doc_id, version in current.evidence_versions):
                raise HTTPException(status_code=409, detail="Evidence changed; save a new draft for review")
            try:
                return asdict(store.approve_content(content_id, reviewer=payload.reviewer))
            except GeoError:
                raise
            except ValueError as error:
                raise HTTPException(status_code=409, detail=str(error)) from error

    @app.get("/runs/{run_id}/content", dependencies=[Depends(require_token)])
    def list_content(run_id: str) -> list[dict[str, object]]:
        return [asdict(item) for item in store.list_content(run_id=run_id)]

    @app.get("/dashboard", dependencies=[Depends(require_token)])
    def get_dashboard():
        return dashboard(store.list_runs(limit=500))

    @app.get("/prompts", dependencies=[Depends(require_token)])
    def list_prompts():
        return store.list_prompts()

    @app.post("/prompts", dependencies=[Depends(require_token)])
    def save_prompt(payload: PromptInput):
        return store.save_prompt(payload.id, payload.model_dump())

    @app.get("/faqs", dependencies=[Depends(require_token)])
    def list_faqs(status: str | None = None) -> list[dict[str, object]]:
        faqs = store.list_faqs(status=status)
        return [asdict(faq) for faq in faqs]

    @app.post("/faqs", dependencies=[Depends(require_token)])
    def create_faq(payload: FAQInput) -> dict[str, object]:
        faq = FAQItem(
            id=payload.id,
            question=payload.question,
            answer=payload.answer,
            category=payload.category,
            keywords=tuple(payload.keywords),
            status="draft",
            created_by=payload.created_by,
        )
        try:
            return asdict(store.save_faq(faq, actor=payload.created_by))
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/faqs/{faq_id}/approve", dependencies=[Depends(require_token)])
    def approve_faq(faq_id: str) -> dict[str, object]:
        try:
            return asdict(store.approve_faq(faq_id))
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/auth")
    def auth(payload: AuthInput) -> dict[str, object]:
        expected_user = os.environ.get("GEO_USERNAME", "admin")
        expected_pass = os.environ.get("GEO_PASSWORD", "geo2026")
        if os.environ.get("GEO_USERNAME") is None or os.environ.get("GEO_PASSWORD") is None:
            warnings.warn(
                "GEO_USERNAME/GEO_PASSWORD not set; using default credentials (admin/geo2026). "
                "Set these environment variables in production.",
                RuntimeWarning,
            )
        if payload.username != expected_user or not secrets.compare_digest(payload.password, expected_pass):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return {"token": token, "username": payload.username}

    @app.get("/tasks", dependencies=[Depends(require_token)])
    def list_tasks() -> list[dict[str, object]]:
        return store.list_tasks()

    @app.post("/tasks", dependencies=[Depends(require_token)])
    def create_task(payload: TaskInput) -> dict[str, object]:
        return store.save_task(payload.id, payload.name, payload.brand, payload.queries, payload.created_by)

    @app.post("/tasks/{task_id}/run", dependencies=[Depends(require_token)])
    def run_task(task_id: str) -> dict[str, object]:
        task = store.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        queries = json.loads(task["queries"]) if isinstance(task["queries"], str) else task["queries"]
        brand_name = task["brand"]
        results = []
        store.update_task_status(task_id, "running")
        brand = BrandProfile(brand_name)
        for i, query in enumerate(queries):
            try:
                run_id = f"{task_id}-{i}"
                workflow = workflows.get()
                state = workflow.invoke({"mode": "monitor", "query": query, "brand": brand, "run_id": run_id})
                raw = state["raw_response"]
                record = RunRecord(
                    run_id=run_id, query=query, brand=brand_name, model=raw.model,
                    raw_answer=raw.text, metrics=state["metrics"],
                    evidence_ids=tuple(item.document_id for item in state.get("evidence", [])),
                    suggestion=state.get("suggestion", ""), status=state.get("status", "needs_review"),
                    sources=raw.source_urls, created_at=datetime.now(timezone.utc).isoformat(),
                    input_tokens=raw.input_tokens, output_tokens=raw.output_tokens,
                    trace=tuple(state.get("trace", [])),
                )
                store.save_run(record)
                results.append({"query": query, "status": "ok", "run_id": run_id})
            except GeoError:
                raise  # Let IdempotencyConflict / RunInProgress propagate correctly
            except Exception as e:
                results.append({"query": query, "status": "failed", "error": type(e).__name__})
        failed = sum(1 for r in results if r["status"] == "failed")
        if failed == len(results) and results:
            store.update_task_status(task_id, "failed")
        elif failed > 0:
            store.update_task_status(task_id, "partial_failure")
        else:
            store.update_task_status(task_id, "completed")
        return {"task_id": task_id, "results": results, "total": len(results)}

    @app.put("/tasks/{task_id}", dependencies=[Depends(require_token)])
    def edit_task(task_id: str, payload: EditTaskInput) -> dict[str, object]:
        task = store.get_task(task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        result = store.update_task(task_id, payload.name, payload.brand, payload.queries)
        if result is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return result

    @app.delete("/tasks/{task_id}", dependencies=[Depends(require_token)])
    def delete_task(task_id: str) -> dict[str, object]:
        ok = store.delete_task(task_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"deleted": task_id}

    @app.delete("/runs/{run_id}", dependencies=[Depends(require_token)])
    def delete_run(run_id: str) -> dict[str, object]:
        ok = store.delete_run(run_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Run not found")
        return {"deleted": run_id}

    @app.delete("/prompts/{prompt_id}", dependencies=[Depends(require_token)])
    def delete_prompt(prompt_id: str) -> dict[str, object]:
        ok = store.delete_prompt(prompt_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Prompt not found")
        return {"deleted": prompt_id}

    @app.delete("/faqs/{faq_id}", dependencies=[Depends(require_token)])
    def delete_faq(faq_id: str) -> dict[str, object]:
        ok = store.delete_faq(faq_id)
        if not ok:
            raise HTTPException(status_code=404, detail="FAQ not found")
        return {"deleted": faq_id}

    @app.post("/batch-monitor", dependencies=[Depends(require_token)])
    def batch_monitor(payload: BatchMonitorInput) -> list[dict[str, object]]:
        brand = BrandProfile(payload.brand.name, tuple(payload.brand.aliases), tuple(payload.brand.competitors))
        results = []
        for i, query in enumerate(payload.queries):
            run_id = payload.run_ids[i] if payload.run_ids else f"batch-{str(uuid4())[:8]}-{i}"
            try:
                existing = store.claim_run(run_id, {"query": query, "brand": brand.name})
                if existing:
                    results.append({"query": query, "status": "ok", "run_id": run_id})
                    continue
                workflow = workflows.get()
                snapshot = workflow.retrieval.catalog
                state = workflow.invoke({"mode": "monitor", "query": query, "brand": brand, "run_id": run_id})
                raw = state["raw_response"]
                record = RunRecord(
                    run_id=run_id, query=query, brand=brand.name, model=raw.model,
                    raw_answer=raw.text, metrics=state["metrics"],
                    evidence_ids=tuple(item.document_id for item in state.get("evidence", [])),
                    suggestion=state.get("suggestion", ""), status=state.get("status", "needs_review"),
                    sources=raw.source_urls, created_at=datetime.now(timezone.utc).isoformat(),
                    input_tokens=raw.input_tokens, output_tokens=raw.output_tokens,
                    trace=tuple(state.get("trace", [])),
                    evidence_versions=tuple((item.document_id, snapshot.document(item.document_id).version) for item in state.get("evidence", [])),
                )
                store.save_run(record)
                results.append({"query": query, "status": "ok", "run_id": run_id})
            except GeoError:
                raise  # Let IdempotencyConflict / RunInProgress propagate correctly
            except Exception as e:
                results.append({"query": query, "status": "failed", "error": type(e).__name__})
        return results

    # ── Static files (login.html, workbench.html) ──
    static_dir = Path(__file__).resolve().parents[2]

    @app.get("/")
    def root_redirect():
        return RedirectResponse(url="/login.html")

    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

    @app.get("/login.html")
    def serve_login():
        return FileResponse(static_dir / "login.html")

    @app.get("/workbench.html")
    def serve_workbench():
        return FileResponse(static_dir / "workbench.html")

    return app

