from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

from .contracts import BusinessError, SHANGHAI, bounded_text, multiline_text, cents, date_window, money, validate_plan


def pagination(page=1, page_size=20):
    if type(page) is not int or page < 1 or type(page_size) is not int or not 1 <= page_size <= 50:
        raise BusinessError("invalid_page", "分页参数不正确，每页最多 50 条。")
    return page, page_size


def transfer_dto(row):
    return {"transactionId": row["transaction_id"], "time": row["paid_at"], "payerAccount": row["payer"], "payerName": row["payer_name"], "payeeAccount": row["payee"], "payeeName": row["payee_name"], "amount": money(row["amount_cents"]), "summary": row["note"], "sourceRow": row["source_row"]}


def resolve_accounts(store, dataset_id, plan):
    if plan.get("accountIds"):
        marks = ','.join('?' for _ in plan['accountIds'])
        rows = store.db.execute(f"""SELECT account,MIN(name) AS name FROM (
            SELECT payer AS account,payer_name AS name FROM transfers WHERE dataset=?
            UNION SELECT payee,payee_name FROM transfers WHERE dataset=?)
            WHERE account IN ({marks}) GROUP BY account ORDER BY account""", (dataset_id, dataset_id, *plan['accountIds'])).fetchall()
        found = [{"accountId": r['account'], "name": r['name'], "aliases": [r['name']]} for r in rows]
        if len(found) != len(plan["accountIds"]):
            raise BusinessError("account_not_found", "所选账户不属于这个数据集，请重新选择。")
        return found, None
    if plan.get("accountName"):
        matches = store.accounts(dataset_id, plan["accountName"])
        if matches["total"] != 1:
            return [], {"status": "needs_clarification", "message": "名称对应多个账户，请选择账号后继续。" if matches["total"] else "没有匹配的账户，请核对名称或账号。", "candidates": matches["items"], "hasMore": matches["hasMore"]}
        return matches["items"], None
    if plan["direction"] == "net":
        raise BusinessError("account_required", "计算净收支需要先指定账户范围。")
    return [], None


def sql_parts(dataset_id, plan, window):
    clauses, values = ["dataset=?"], [dataset_id]
    accounts = plan.get("accountIds", [])
    direction = plan["direction"]
    if accounts:
        placeholders = ",".join("?" for _ in accounts)
        if direction == "net":
            clauses.append(f"(payee IN ({placeholders}) OR payer IN ({placeholders}))")
            values.extend(accounts * 2)
        else:
            clauses.append(f"{'payee' if direction == 'in' else 'payer'} IN ({placeholders})")
            values.extend(accounts)
    if window[0]:
        clauses.extend(["paid_at>=?", "paid_at<?"])
        values.extend(window)
    for key, operator in [("minAmount", ">="), ("maxAmount", "<=")]:
        if key in plan:
            if plan.get("minExclusive" if key == "minAmount" else "maxExclusive"):
                operator = ">" if key == "minAmount" else "<"
            clauses.append(f"amount_cents{operator}?")
            values.append(cents(plan[key]))
    if plan.get("counterpartyName"):
        if direction == "net":
            raise BusinessError("invalid_query", "净收支查询暂不支持对手名称筛选，请选择收款或付款方向。")
        column = "payer_name" if direction == "in" else "payee_name"
        clauses.append(f"instr({column},?)>0")
        values.append(plan["counterpartyName"])
    if plan.get("counterpartyAccountId"):
        if direction == "net":
            raise BusinessError("invalid_query", "净收支查询暂不支持交易对手筛选。")
        column = "payer" if direction == "in" else "payee"
        clauses.append(f"{column}=?")
        values.append(plan["counterpartyAccountId"])
    return " AND ".join(clauses), values


def amount_expression(plan):
    if plan["direction"] != "net":
        return "amount_cents", []
    accounts = plan["accountIds"]
    marks = ",".join("?" for _ in accounts)
    return f"amount_cents*((CASE WHEN payee IN ({marks}) THEN 1 ELSE 0 END)-(CASE WHEN payer IN ({marks}) THEN 1 ELSE 0 END))", accounts * 2


def evidence(store, dataset_id, plan, window, page=1, page_size=20):
    pagination(page, page_size)
    where, args = sql_parts(dataset_id, plan, window)
    rows = store.db.execute(f"SELECT * FROM transfers WHERE {where} ORDER BY paid_at,transaction_id LIMIT ? OFFSET ?", (*args, page_size, (page - 1) * page_size)).fetchall()
    total = store.db.execute(f"SELECT count(*) FROM transfers WHERE {where}", args).fetchone()[0]
    return {"items": [transfer_dto(r) for r in rows], "total": total, "page": page, "pageSize": page_size}


def execute(store, dataset_id, plan, accounts, window, reference_time):
    where, args = sql_parts(dataset_id, plan, window)
    expression, expression_args = amount_expression(plan)
    summary = store.db.execute(f"SELECT count(*) AS n,COALESCE(SUM({expression}),0) AS amount FROM transfers WHERE {where}", (*expression_args, *args)).fetchone()
    grouped, group_count = [], 0
    if plan["kind"] == "counterparties":
        counterparty = "payer" if plan["direction"] == "in" else "payee"
        name = "payer_name" if plan["direction"] == "in" else "payee_name"
        rows = store.db.execute(f"SELECT {counterparty} AS account,MIN({name}) AS name,SUM(amount_cents) AS amount,count(*) AS n FROM transfers WHERE {where} GROUP BY {counterparty} ORDER BY amount DESC,account LIMIT ?", (*args, plan["limit"])).fetchall()
        group_count = store.db.execute(f"SELECT count(DISTINCT {counterparty}) FROM transfers WHERE {where}", args).fetchone()[0]
        grouped = [{"label": r["name"], "accountId": r["account"], "amount": money(r["amount"]), "count": r["n"]} for r in rows]
    elif plan["kind"] == "trend":
        buckets = {"day": "substr(paid_at,1,10)", "month": "substr(paid_at,1,7)", "week": "date(substr(paid_at,1,10),'-'||((cast(strftime('%w',paid_at) AS INTEGER)+6)%7)||' days')"}
        bucket = buckets[plan["granularity"]]
        rows = store.db.execute(f"SELECT {bucket} AS bucket,SUM({expression}) AS amount,count(*) AS n FROM transfers WHERE {where} GROUP BY bucket ORDER BY bucket LIMIT 121", (*expression_args, *args)).fetchall()
        group_count = store.db.execute(f"SELECT count(DISTINCT {bucket}) FROM transfers WHERE {where}", args).fetchone()[0]
        grouped = [{"label": r["bucket"], "amount": money(r["amount"]), "count": r["n"]} for r in rows[:120]]
    dataset = store.dataset_dto(store.dataset(dataset_id))
    return {"status": "completed", "kind": plan["kind"], "direction": plan["direction"], "amount": money(summary["amount"]), "count": summary["n"], "currency": "CNY", "groups": grouped, "groupCount": group_count, "groupsTruncated": group_count > len(grouped), "accounts": accounts, "window": {"startInclusive": window[0], "endExclusive": window[1], "timezone": "Asia/Shanghai"}, "plan": plan, "dataset": dataset, "evidence": evidence(store, dataset_id, plan, window, 1, 10), "policy": "仅统计当前数据集中的成功人民币转账；收付款均为账面总额，不自动排除本人账户互转；净收支中所选账户之间互转贡献为零；不等同营业收入或利润。", "referenceTime": reference_time.astimezone(SHANGHAI).strftime("%Y-%m-%d %H:%M:%S")}


def run_query(store, dataset_id, request):
    dataset = store.dataset(dataset_id)
    dataset_id = dataset["id"]
    query_id = request.get("queryId")
    if query_id:
        row = store.question(query_id)
        if row["dataset"] != dataset_id:
            raise BusinessError("query_not_found", "查询与所选数据集不一致。")
    else:
        question = multiline_text(request.get("question", "资金查询"), "问题", 1000)
        query_id = store.prepare(dataset_id, question, request.get("operationId") or str(uuid.uuid4()))["queryId"]
    plan_input = request.get("plan", {})
    try:
        base_id = request.get("baseQueryId") or store.question(query_id)["base_query_id"]
        if base_id:
            base = store.question(base_id)
            if store.question(query_id)['session_id'] != base['session_id']:
                raise BusinessError('invalid_base_query', '不同会话之间不能继承查询条件。')
            if base["dataset"] != dataset_id or not base["plan"] or base["status"] not in {"completed", "needs_clarification"}:
                raise BusinessError("invalid_base_query", "追问需要选择当前数据集内已完成或待确认账户的查询。")
            inherited = json.loads(base["plan"])
            if not isinstance(plan_input, dict):
                raise BusinessError("invalid_query", "查询条件格式不正确。")
            # A follow-up inherits the saved date window, not a newly interpreted
            # relative month/week. Explicit new time conditions replace it.
            if base["result"] and "period" not in plan_input and "startDate" not in plan_input and "endDate" not in plan_input:
                saved_window = json.loads(base["result"]).get("window", {})
                if saved_window.get("startInclusive") and saved_window.get("endExclusive"):
                    inherited.update(period="custom", startDate=saved_window["startInclusive"][:10], endDate=(datetime.strptime(saved_window["endExclusive"][:10], "%Y-%m-%d")-timedelta(days=1)).strftime("%Y-%m-%d"))
            if "accountName" in plan_input and "accountIds" not in plan_input:
                inherited.pop("accountIds", None)
            if "accountIds" in plan_input and "accountName" not in plan_input:
                inherited.pop("accountName", None)
            if "counterpartyAccountId" in plan_input and "counterpartyName" not in plan_input:
                inherited.pop("counterpartyName", None)
            if "counterpartyName" in plan_input and "counterpartyAccountId" not in plan_input:
                inherited.pop("counterpartyAccountId", None)
            for key in request.get("clearFilters", []):
                if key not in {"accountIds", "accountName", "minAmount", "maxAmount", "minExclusive", "maxExclusive", "counterpartyName", "counterpartyAccountId"}:
                    raise BusinessError("invalid_query", "不支持清除该筛选项。")
                inherited.pop(key, None)
            plan_input = {**inherited, **plan_input}
        plan = validate_plan(plan_input)
        accounts, clarification = resolve_accounts(store, dataset_id, plan)
        if clarification:
            result = {**clarification, "queryId": query_id, "datasetId": dataset_id, "plan": plan}
            store.update_question(query_id, "needs_clarification", plan, result)
            return result
        if accounts:
            plan["accountIds"] = [a["accountId"] for a in accounts]
        reference_time = datetime.fromisoformat(store.question(query_id)["created_at"])
        window = date_window(plan, reference_time)
        previous = store.question(query_id)
        if previous["status"] == "completed" and previous["plan"]:
            if json.loads(previous["plan"]) != plan:
                raise BusinessError("query_conflict", "此问题已有结果，请创建新问题以改变条件。")
            return {**json.loads(previous["result"]), "reused": True}
        result = {**execute(store, dataset_id, plan, accounts, window, reference_time), "queryId": query_id}
        store.update_question(query_id, "completed", plan, result)
        return result
    except BusinessError as error:
        if store.question(query_id)["status"] != "completed":
            store.update_question(query_id, "failed", {}, error=error.message)
        raise


def query_result(store, query_id, page=1, page_size=20):
    row = store.question(query_id)
    if not row["result"]:
        return {"queryId": query_id, **store.question_state(row), "question": row["question"]}
    result = json.loads(row["result"])
    if result["status"] == "completed":
        window = (result["window"]["startInclusive"], result["window"]["endExclusive"])
        result["evidence"] = evidence(store, row["dataset"], result["plan"], window, page, page_size)
    return {**result, "question": row["question"]}
