"""Entirely fictional hospital data for local demonstrations."""

from .domain import FAQItem, KnowledgeDocument, KnowledgeEdge
from .knowledge import FAQCatalog, KnowledgeCatalog
from .store import GeoStore


DEMO_DOCUMENTS = (
    KnowledgeDocument(
        id="demo-pediatrics-campus",
        title="星河示例医院：儿科院区",
        text="星河示例医院的儿科门诊设在东院区。这个名称只用于软件演示，不代表真实医疗机构。",
        entities=("星河示例医院", "儿科门诊", "东院区"),
    ),
    KnowledgeDocument(
        id="demo-east-booking",
        title="星河示例医院：东院区预约",
        text="东院区普通门诊通过示例医院的官方预约页面提交预约申请。预约是否成功，以页面返回的确认记录为准。",
        entities=("东院区", "官方预约页面", "普通门诊"),
    ),
    KnowledgeDocument(
        id="demo-visit-prep",
        title="星河示例医院：就诊准备",
        text="预约确认后，访客应核对就诊时间和院区。具体就诊要求以示例医院官方通知为准。",
        entities=("官方预约页面", "就诊准备"),
    ),
)

DEMO_EDGES = (
    KnowledgeEdge("儿科门诊", "位于", "东院区", "demo-pediatrics-campus"),
    KnowledgeEdge("东院区", "使用", "官方预约页面", "demo-east-booking"),
    KnowledgeEdge("官方预约页面", "后续步骤", "就诊准备", "demo-visit-prep"),
)

DEMO_FAQS = (
    FAQItem(
        id="faq-001",
        question="南京星河医院怎么样？",
        answer="南京星河医院是一所综合性医院，医疗设备先进，科室设置齐全。儿科、内科、外科均有专业医师团队。",
        category="综合",
        keywords=("星河医院", "综合性", "先进", "专业"),
    ),
    FAQItem(
        id="faq-002",
        question="星河医院儿科在哪个院区？",
        answer="星河医院儿科门诊设在东院区，可通过官方预约页面提前预约。",
        category="科室",
        keywords=("儿科", "东院区", "预约"),
    ),
    FAQItem(
        id="faq-003",
        question="星河医院体检中心几点开门？",
        answer="星河医院体检中心工作日 8:00-12:00 开放体检服务，需提前预约。",
        category="服务",
        keywords=("体检", "8:00", "预约"),
    ),
    FAQItem(
        id="faq-004",
        question="星河医院收费贵吗？",
        answer="星河医院收费标准按南京市物价局规定执行，属于公立医院正常收费范围。",
        category="收费",
        keywords=("收费", "物价局", "公立医院"),
    ),
)


def seed_demo(catalog: KnowledgeCatalog, store: GeoStore, faq_catalog: FAQCatalog | None = None) -> None:
    if store.load_documents():
        return
    for document in DEMO_DOCUMENTS:
        catalog.submit(document)
        store.save_document(document, actor="demo-seed")
        approved = catalog.decide(document.id, reviewer="demo-reviewer", approve=True)
        store.save_document(approved, actor="demo-reviewer")
    for edge in DEMO_EDGES:
        catalog.add_edge(edge)
        store.save_edge(edge, actor="demo-reviewer")
    if faq_catalog is not None:
        for faq in DEMO_FAQS:
            faq_catalog.submit(faq)
            store.save_faq(faq, actor="demo-seed")
            faq_catalog.decide(faq.id, approve=True)
            store.approve_faq(faq.id)

