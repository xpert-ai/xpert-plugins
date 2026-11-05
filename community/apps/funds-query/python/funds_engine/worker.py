"""One JSON request on stdin, one bounded JSON response on stdout; no HTTP port."""
from __future__ import annotations

import base64
import binascii
import json
import os
import sys
from datetime import datetime

from .analytics import evidence, pagination, query_result, run_query
from .contracts import BusinessError, SHANGHAI, bounded_text, multiline_text
from .storage import Store


def dispatch(store, action, payload):
    if not isinstance(payload, dict):
        raise BusinessError("invalid_input", "请求格式不正确。")
    if action == "import":
        name = bounded_text(payload.get("fileName"), "文件名", 200)
        try:
            content = base64.b64decode(payload.get("base64", ""), validate=True)
        except (binascii.Error, TypeError, ValueError):
            raise BusinessError("invalid_file", "文件传输不完整，请重新上传。")
        return store.import_file(content, name)
    if action == "datasets":
        return store.datasets(*pagination(payload.get("page", 1), payload.get("pageSize", 20)))
    if action == "select":
        return store.select(payload.get("datasetId"))
    if action == "context":
        current = None
        query = store.question(payload['queryId']) if payload.get('queryId') else None
        if query and payload.get('_runtime') is not None:
            store.runtime_progress(query['id'], payload['_runtime'], 'reading_context')
        try:
            current = store.dataset_dto(store.dataset(query['dataset'] if query else payload.get("datasetId")))
        except BusinessError:
            if payload.get("datasetId"):
                raise
        return {"currentDataset": current, "datasets": store.datasets(), "now": store.now.astimezone(SHANGHAI).strftime("%Y-%m-%d %H:%M:%S"), "timezone": "Asia/Shanghai", "supportedKinds": ["summary", "transactions", "counterparties", "trend"], "dateSemantics": "custom 的 startDate 和 endDate 均包含当天；上周按周一至周日，上个月按自然月。", "scopePolicy": "数据按平台租户、组织和上传用户隔离。"}
    selected = store.dataset(payload['datasetId']) if payload.get('datasetId') else None
    query = store.question(payload['queryId']) if payload.get('queryId') else None
    dataset_id = selected['id'] if selected else store.dataset(query['dataset'] if query else None)['id']
    if query and query['dataset'] != dataset_id:
        raise BusinessError('query_not_found', '查询与所选数据集不一致。')
    if action == 'sessions':
        return store.sessions(dataset_id, *pagination(payload.get('page', 1), payload.get('pageSize', 20)))
    if action == 'create_session':
        return store.create_session(dataset_id, bounded_text(payload.get('operationId'), '操作编号', 128))
    if action == 'select_session':
        return store.select_session(dataset_id, payload.get('sessionId'))
    if action == 'chat':
        return store.chat(dataset_id, payload.get('sessionId'), *pagination(payload.get('page', 1), payload.get('pageSize', 20)))
    if action == 'progress':
        return store.runtime_progress(payload.get('queryId'), payload.get('_runtime', {}), payload.get('stage'), payload.get('reply'))
    if action == 'delivery_state':
        if payload.get('state') not in {'unconfirmed', 'rejected'} or not query:
            raise BusinessError('invalid_input', '发送状态不正确。')
        with store.db:
            if query['reply_status'] != 'completed':
                store.db.execute('UPDATE questions SET reply_status=? WHERE id=?', (payload['state'], query['id']))
        return {'queryId': query['id']}
    if action == "accounts":
        return store.accounts(dataset_id, bounded_text(payload.get("search", ""), "搜索", 80, False))
    if action == "preview":
        return evidence(store, dataset_id, {"direction": "in"}, (None, None), *pagination(payload.get("page", 1), payload.get("pageSize", 20)))
    if action == "prepare":
        return store.prepare(dataset_id, multiline_text(payload.get("question"), "问题", 1000), bounded_text(payload.get("operationId"), "操作编号", 128), payload.get("baseQueryId"), payload.get('sessionId'))
    if action == "history":
        return store.history(dataset_id, *pagination(payload.get("page", 1), payload.get("pageSize", 20)))
    if action == "dispatch_failed":
        row = store.question(bounded_text(payload.get("queryId"), "查询编号", 128))
        if row["dataset"] != dataset_id:
            raise BusinessError("query_not_found", "查询与数据集不一致。")
        if row["status"] == "pending":
            store.update_question(row["id"], "failed", {}, error="未确认助手收到请求，请检查对话后重新发送。")
        return {"queryId": row["id"], "status": store.question(row["id"])["status"]}
    if action == "run":
        if query and payload.get('_runtime') is not None:
            store.runtime_progress(query['id'], payload['_runtime'], 'analyzing')
        return run_query(store, dataset_id, payload)
    if action == "result":
        result = query_result(store, bounded_text(payload.get("queryId"), "查询编号", 128), *pagination(payload.get("page", 1), payload.get("pageSize", 20)))
        if result.get("dataset", {}).get("id", dataset_id) != dataset_id:
            raise BusinessError("query_not_found", "查询与数据集不一致。")
        return result
    raise BusinessError("unknown_action", "不支持的操作。")


def process(request, directory):
    if not isinstance(request, dict):
        raise BusinessError("invalid_input", "请求格式不正确。")
    store = Store(directory, request.get("scope"))
    try:
        return dispatch(store, request.get("action"), request.get("payload", {}))
    finally:
        store.close()


def main():
    directory = os.environ.get("FUNDS_QUERY_DATA_DIR")
    if not directory:
        print(json.dumps({"ok": False, "error": {"code": "configuration_required", "message": "未配置应用数据目录。"}}))
        return
    try:
        raw = sys.stdin.buffer.read(15 * 1024 * 1024 + 1)
        if len(raw) > 15 * 1024 * 1024:
            raise BusinessError("request_too_large", "请求过大。")
        result = process(json.loads(raw), directory)
        response = {"ok": True, "data": result}
    except BusinessError as error:
        response = {"ok": False, "error": {"code": error.code, "message": error.message, "details": error.details}}
    except (ValueError, TypeError):
        response = {"ok": False, "error": {"code": "invalid_input", "message": "请求数据格式不正确。"}}
    except Exception:
        response = {"ok": False, "error": {"code": "internal_error", "message": "处理失败，请重试或检查应用运行环境。"}}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False))


if __name__ == "__main__":
    main()
