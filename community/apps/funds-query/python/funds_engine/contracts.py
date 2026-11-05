from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

SHANGHAI = timezone(timedelta(hours=8))
MAX_ROWS = 5000
MAX_FILE_BYTES = 10 * 1024 * 1024
HEADERS = ["交易编号", "交易时间", "付款账号", "付款方名称", "收款账号", "收款方名称", "交易金额", "交易摘要"]
SCOPE_KEYS = ("tenantId", "organizationId", "userId")
PLAN_KEYS = {"kind", "direction", "accountIds", "accountName", "period", "startDate", "endDate", "minAmount", "maxAmount", "minExclusive", "maxExclusive", "counterpartyName", "counterpartyAccountId", "limit", "granularity"}


class BusinessError(Exception):
    def __init__(self, code: str, message: str, details=None):
        super().__init__(message)
        self.code, self.message, self.details = code, message, details


def bounded_text(value, field, maximum=160, required=True):
    if not isinstance(value, str) or (required and not value.strip()) or len(value) > maximum:
        raise BusinessError("invalid_input", f"{field}需要填写不超过 {maximum} 字的文本。")
    if any(ord(c) < 32 for c in value):
        raise BusinessError("invalid_input", f"{field}不能包含控制字符。")
    return value.strip()


def multiline_text(value, field, maximum=1000, required=True):
    if not isinstance(value, str):
        raise BusinessError('invalid_input', f'{field}需要填写文本。')
    value = value.replace('\r\n', '\n').replace('\r', '\n')
    if len(value) > maximum or (required and not value.strip()):
        raise BusinessError('invalid_input', f'{field}需要填写不超过 {maximum} 字的文本。')
    if any(ord(c) < 32 and c not in '\n\t' for c in value):
        raise BusinessError('invalid_input', f'{field}不能包含控制字符。')
    return value.strip()


def identity(value):
    if not isinstance(value, dict) or set(value) != set(SCOPE_KEYS):
        raise BusinessError("scope_required", "缺少平台提供的用户与组织身份。")
    return tuple(bounded_text(value.get(k), k, 128) for k in SCOPE_KEYS)


def cents(value):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise BusinessError("invalid_amount", "金额必须是人民币数字，最多两位小数。")
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount < 0 or amount > Decimal("999999999999.99"):
            raise InvalidOperation()
        scaled = amount * 100
        if scaled != scaled.to_integral_value():
            raise InvalidOperation()
        return int(scaled)
    except (InvalidOperation, ValueError):
        raise BusinessError("invalid_amount", "金额必须为非负数字，最多两位小数，且不超过 999999999999.99 元。")


def money(value):
    sign = "-" if value < 0 else ""
    value = abs(int(value))
    return f"{sign}{value // 100}.{value % 100:02d}"


def parse_time(value):
    if isinstance(value, datetime):
        if value.tzinfo or value.microsecond:
            raise ValueError("交易时间需为北京时间，精确到秒。")
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, str):
        dt = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
        if dt.strftime("%Y-%m-%d %H:%M:%S") != value:
            raise ValueError("交易时间格式不正确。")
        return value
    raise ValueError("交易时间格式需为 yyyy-MM-dd HH:mm:ss。")


def date_window(plan, now):
    today = now.astimezone(SHANGHAI).date()
    period = plan.get("period", "all")
    if period == "all":
        return None, None
    if period in ("this_month", "last_month"):
        start = today.replace(day=1)
        if period == "last_month":
            end = start
            start = (start - timedelta(days=1)).replace(day=1)
        else:
            end = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    elif period in ("this_week", "last_week"):
        start = today - timedelta(days=today.weekday())
        if period == "last_week":
            start -= timedelta(days=7)
        end = start + timedelta(days=7)
    elif period == "custom":
        try:
            start = datetime.strptime(plan["startDate"], "%Y-%m-%d").date()
            end = datetime.strptime(plan["endDate"], "%Y-%m-%d").date() + timedelta(days=1)
        except (ValueError, KeyError, TypeError):
            raise BusinessError("invalid_dates", "自定义日期需要填写起止日期，格式为 yyyy-MM-dd。")
        if start >= end:
            raise BusinessError("invalid_dates", "结束日期不能早于开始日期。")
    else:
        raise BusinessError("invalid_period", "不支持的时间范围。")
    return f"{start} 00:00:00", f"{end} 00:00:00"


def validate_plan(plan):
    if not isinstance(plan, dict) or set(plan) - PLAN_KEYS:
        raise BusinessError("invalid_query", "查询包含不支持的字段；不接受 SQL 或代码。")
    result = dict(plan)
    for key, choices, default in [
        ("kind", {"summary", "transactions", "counterparties", "trend"}, "summary"),
        ("direction", {"in", "out", "net"}, "in"),
        ("period", {"all", "this_month", "last_month", "this_week", "last_week", "custom"}, "all"),
        ("granularity", {"day", "week", "month"}, "day"),
    ]:
        if result.get(key, default) not in choices:
            raise BusinessError("invalid_query", f"不支持的查询选项：{key}。")
        result.setdefault(key, default)
    for key, maximum in [("accountName", 80), ("counterpartyName", 80), ("counterpartyAccountId", 128)]:
        if key in result:
            result[key] = bounded_text(result[key], key, maximum)
    if "accountIds" in result:
        ids = result["accountIds"]
        if not isinstance(ids, list) or not 1 <= len(ids) <= 20:
            raise BusinessError("invalid_query", "请选择 1 至 20 个账户。")
        result["accountIds"] = sorted(set(bounded_text(x, "账号", 128) for x in ids))
    limit = result.get("limit", 10)
    if type(limit) is not int or not 1 <= limit <= 20:
        raise BusinessError("invalid_query", "排行数量需为 1 至 20。")
    result["limit"] = limit
    for key in ["minAmount", "maxAmount"]:
        if key in result:
            result[key] = money(cents(result[key]))
    for key in ["minExclusive", "maxExclusive"]:
        if key in result and type(result[key]) is not bool:
            raise BusinessError("invalid_query", "金额边界选项必须为布尔值。")
    if "minAmount" in result and "maxAmount" in result and cents(result["minAmount"]) > cents(result["maxAmount"]):
        raise BusinessError("invalid_query", "金额下限不能高于上限。")
    if result["kind"] == "counterparties" and result["direction"] == "net":
        raise BusinessError("invalid_query", "对手排行请选择收款或付款方向。")
    if result["period"] != "custom":
        result.pop("startDate", None)
        result.pop("endDate", None)
    return result
