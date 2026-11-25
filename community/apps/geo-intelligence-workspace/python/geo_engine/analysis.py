from __future__ import annotations

import re
import unicodedata

from .domain import AnswerMetrics, BrandProfile, FAQCheckResult, FAQItem, ModelResponse, SentimentResult


def _normalized(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def measure_answer(response: ModelResponse, brand: BrandProfile) -> AnswerMetrics:
    answer = _normalized(response.text)
    names = [brand.name, *brand.aliases]
    hits = [name for name in names if name.strip() and _normalized(name) in answer]
    competitors = tuple(name for name in brand.competitors if name.strip() and _normalized(name) in answer)
    excerpt = None
    if hits:
        position = answer.find(_normalized(hits[0]))
        excerpt = response.text[max(0, position - 45) : position + len(hits[0]) + 65]
    return AnswerMetrics(
        brand_mentioned=bool(hits),
        competitor_mentions=competitors,
        brand_evidence=excerpt,
        citations_available=bool(response.source_urls),
        citation_urls=response.source_urls,
    )


_POSITIVE_WORDS = (
    "好", "很好", "不错", "优秀", "推荐", "专业", "先进", "温馨", "舒适",
    "一流", "顶尖", "权威", "知名", "放心", "满意", "信赖", "方便",
    "热情", "耐心", "高效", "整洁", "安全", "规范", "全面", "丰富",
    "及时", "准确", "优质", "合理", "清晰", "到位", "周到", "贴心",
)
_NEGATIVE_WORDS = (
    "差", "很差", "糟糕", "投诉", "事故", "混乱", "脏", "贵", "坑",
    "恶劣", "敷衍", "拖延", "不靠谱", "虚假", "骗", "黑心", "乱收费",
    "态度差", "不耐烦", "等候", "排队", "拥挤", "破旧", "落后", "简陋",
    "误诊", "过度医疗", "不负责任", "失望", "不满", "差评",
)


def analyze_sentiment(text: str) -> SentimentResult:
    normalized = _normalized(text)
    found_positive = [w for w in _POSITIVE_WORDS if w in normalized]
    found_negative = [w for w in _NEGATIVE_WORDS if w in normalized]
    pos_score = len(found_positive)
    neg_score = len(found_negative)
    total = pos_score + neg_score
    if total == 0:
        polarity = "neutral"
        score = 0.0
    elif pos_score > neg_score:
        polarity = "positive"
        score = pos_score / total
    elif neg_score > pos_score:
        polarity = "negative"
        score = -neg_score / total
    else:
        polarity = "neutral"
        score = 0.0
    return SentimentResult(
        polarity=polarity,
        score=round(score, 3),
        positive_words=tuple(found_positive),
        negative_words=tuple(found_negative),
    )


def _char_overlap(text1: str, text2: str) -> float:
    set1 = set(_normalized(text1))
    set2 = set(_normalized(text2))
    if not set1 or not set2:
        return 0.0
    common = len(set1 & set2)
    return common / max(len(set1), len(set2))


def check_answer_against_faqs(ai_answer: str, faqs: list[FAQItem], threshold: float = 0.15) -> FAQCheckResult:
    if not faqs or not ai_answer.strip():
        return FAQCheckResult(matched_faq_id=None, consistency_score=0.0, has_contradiction=False)
    best_faq: FAQItem | None = None
    best_score = 0.0
    for faq in faqs:
        score = _char_overlap(ai_answer, faq.answer)
        if score > best_score:
            best_score = score
            best_faq = faq
    matched_keywords: tuple[str, ...] = ()
    if best_faq and best_score >= threshold:
        matched_keywords = tuple(
            kw for kw in best_faq.keywords if kw and kw in _normalized(ai_answer)
        )
    return FAQCheckResult(
        matched_faq_id=best_faq.id if best_faq and best_score >= threshold else None,
        consistency_score=round(best_score, 3),
        has_contradiction=False,
        matched_keywords=matched_keywords,
    )

