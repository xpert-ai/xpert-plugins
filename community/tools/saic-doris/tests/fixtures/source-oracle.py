# Offline oracle extracted from the user-supplied v5.3-bool-default server.
# No network code, credentials, connection defaults or server startup are included.
import json, re, hashlib, sys
from datetime import datetime, date


MCP_BUILD = "v5.3-bool-default"

def _j(obj):
    return json.dumps(obj, ensure_ascii=False, default=str)

READ_TABLES = {"sc_task", "sc_part_cross_ref", "sc_owner", "sc_ship_rule",
               "sc_run_log", "sc_agent_run"}

COLSPEC = {
    "sc_part_cross_ref": {
        "customer_part_no": ("str", True, 32), "hsac_drawing_no": ("str", False, 16),
        "part_name": ("str", False, 128), "owner": ("str", False, 256),
        "active": ("bool", False, 0), "updated_by": ("str", False, 64),
        "updated_at": ("dt", False, 0), "note": ("str", False, 256)},
    "sc_owner": {
        "owner_name": ("str", True, 64), "email": ("str", True, 128),
        "cc_emails": ("str", False, 512), "scope_note": ("str", False, 256),
        "active": ("bool", False, 0)},
    "sc_ship_rule": {
        "factory_code": ("str", True, 16), "source_tag": ("str", True, 16),
        "offset_days": ("int", True, 0), "calendar": ("str", False, 16),
        "active": ("bool", False, 0), "updated_by": ("str", False, 64),
        "updated_at": ("dt", False, 0)},
    "sc_task": {
        "seq_no": ("int", True, 0), "task_code": ("str", True, 48),
        "task_name": ("str", True, 128), "site_code": ("str", True, 32),
        "spec_text": ("str", True, 60000), "spec_hash": ("str", False, 16),
        # 🆕 v5.1：门户网站地址（解析输入；改后需触发解析）
        "url": ("str", False, 256),
        "freq": ("str", False, 16), "output_pattern": ("str", False, 128),
        "enters_matrix": ("bool", False, 0), "active": ("bool", False, 0),
        "owner": ("str", False, 64),
        # 🔧 补：采集/Agent 状态机列（update_task_spec / set_task_agent_state 写回需要，
        #    不补会被 _merge_insert 的未知列校验拦截）
        "collector_status": ("str", False, 16), "collector_module": ("str", False, 128),
        "consecutive_failures": ("int", False, 0), "last_error": ("str", False, 1000),
        "agent_status": ("str", False, 16), "agent_question": ("str", False, 8000),
        "agent_answer": ("str", False, 8000), "agent_session_id": ("str", False, 64),
        "agent_attempts": ("int", False, 0),
        "agent_started_at": ("dt", False, 0), "agent_finished_at": ("dt", False, 0),
        "spec_updated_at": ("dt", False, 0),
        # 🔧 v4.3 修复：set_task_agent_state(parse_result_json) 需要；clarify_json/
        #    last_success_at 一并补齐，避免后续写回再撞"未知列"
        "parse_result": ("jsonstr", False, 1000000), "clarify_json": ("jsonstr", False, 1000000),
        "last_success_at": ("dt", False, 0),
        # 🆕 v4.3：当前进行中 episode 的 thread 指针
        "active_thread_id": ("str", False, 64)},
    "sc_run_log": {
        "run_date": ("str", True, 8), "task_seq": ("int", True, 0),
        "task_code": ("str", False, 48),
        "status": ("str", False, 16), "output_file": ("str", False, 256),
        "row_count": ("int", False, 0), "byte_count": ("int", False, 0),
        "factory_check": ("str", False, 64), "error_msg": ("str", False, 1000),
        "started_at": ("dt", False, 0), "finished_at": ("dt", False, 0)},
    "sc_agent_run": {
        # v4.3 台账列：问答原文在 ChatKit thread，本表只存状态/指针/机器结论
        "run_id": ("str", True, 64), "kind": ("str", False, 16),
        "task_seqs": ("str", False, 200), "task_codes": ("str", False, 500),
        "thread_id": ("str", False, 64),
        "conversation_id": ("str", False, 64),
        "triggered_by": ("str", True, 32), "principal_user": ("str", False, 64),
        "status": ("str", False, 16), "summary": ("str", False, 500),
        "result_json": ("jsonstr", False, 1000000),
        "started_at": ("dt", False, 0), "finished_at": ("dt", False, 0)},
}

KEY_COLS = {
    "sc_part_cross_ref": ("customer_part_no",),
    "sc_owner": ("owner_name",),
    "sc_ship_rule": ("factory_code", "source_tag"),
    "sc_task": ("seq_no",),
    "sc_run_log": ("run_date", "task_seq"),
    "sc_agent_run": ("run_id",),
}

AGENT_STATUS = {"idle", "queued", "running", "need_info", "done", "failed"}

_TRUE = {True, 1, "1", "true", "True", "yes", "Y"}

def _coerce(col, typ, n, v):
    if typ == "str":
        s = str(v).strip()
        return s[:n] if n else s
    if typ == "int":
        return int(str(v).strip())
    if typ == "bool":
        return v in _TRUE
    if typ == "dt":
        if isinstance(v, (datetime, date)):
            return v.isoformat(sep=" ", timespec="seconds") if isinstance(v, datetime) else v.isoformat()
        return str(v).strip()[:19]
    if typ == "jsonstr":
        return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)
    return v

def _clean(table, row):
    """校验一行写入数据 → (cols, vals) 或抛 ValueError"""
    spec = COLSPEC[table]
    if not isinstance(row, dict):
        raise ValueError("每行必须是对象 {列名: 值}")
    unknown = [k for k in row if k not in spec]
    if unknown:
        raise ValueError(f"未知列 {unknown}；{table} 允许列: {sorted(spec)}")
    cols, vals = [], []
    for col, (typ, req, n) in spec.items():
        if col not in row or row[col] is None:
            if req:
                raise ValueError(f"缺必填列 {col}")
            continue
        cols.append(col)
        vals.append(_coerce(col, typ, n, row[col]))
    return tuple(cols), tuple(vals)

def _upsert(table, rows, cap=500):
    """批量 upsert = 读-合并-整行 INSERT（v4.9 修复）。
    🔴 Doris UNIQUE KEY 模型下，只写部分列的 INSERT 会把【未列出的列重置为 NULL】，
    因此必须先按 KEY_COLS 批量读回旧行、在内存合并、再整行 INSERT（与 BFF upsertRows 同逻辑）。
    2026-09-24 事故复盘：只传 {customer_part_no, owner} 曾抹空 689 行的 hsac/part_name。"""
    if table not in COLSPEC or table == "sc_credential":
        return {"error": f"不允许写入 {table}"}
    if not rows:
        return {"error": "rows 为空"}
    if len(rows) > cap:
        return {"error": f"单次最多 {cap} 行，收到 {len(rows)}"}
    cleaned = []
    for i, r in enumerate(rows):
        try:
            cleaned.append(_clean(table, r))
        except ValueError as e:
            return {"error": f"第{i+1}行: {e}"}
    keys = KEY_COLS[table]
    # 🔧 _clean 返回 (cols, vals) 元组 → 转 dict 才能按键取值（修复 tuple indices 报错）
    cleaned = [dict(zip(c, v)) for c, v in cleaned]
    # 批量读旧行（按键 IN）
    key_tuples = [tuple(d[k] for k in keys) for d in cleaned]
    old_map = {}
    if len(keys) == 1:
        ks = sorted({kt[0] for kt in key_tuples})
        ph = ",".join(["%s"] * len(ks))
        cur = _fetch(f"SELECT * FROM `{table}` WHERE `{keys[0]}` IN ({ph})", tuple(ks), cap=len(ks) + 1)
        for r in cur["data"]:
            old_map[(r[keys[0]],)] = r
    else:
        cond = " OR ".join(["(" + " AND ".join(f"`{k}` = %s" for k in keys) + ")"] * len(key_tuples))
        cur = _fetch(f"SELECT * FROM `{table}` WHERE {cond}",
                     tuple(v for kt in key_tuples for v in kt), cap=len(key_tuples) + 1)
        for r in cur["data"]:
            old_map[tuple(r[k] for k in keys)] = r
    # 合并 → 整行
    full = []
    for d, kt in zip(cleaned, key_tuples):
        merged = dict(old_map.get(kt) or {})
        merged.update(d)
        miss = [c for c, (_, req, _) in COLSPEC[table].items()
                if req and merged.get(c) is None]
        if miss:
            return {"error": f"键 {kt} 合并后仍缺必填列 {miss}"}
        # 🔧 v4.9g：列集合一律用【表全列】。按"非空列"裁剪会导致含 NULL 的行
        #    列集合不一致 → 分批 INSERT 报"列集合不一致"。写全列、真 NULL 传 None，
        #    与库中真实状态一致且幂等（merged 已含旧值，不会误抹）。
        # 🔴 v5.5 修复（与 BFF doris.js 同步）：bool 列（active/enters_matrix）若合并后
        #    仍为 None，写 NULL 会压掉 DDL 的 DEFAULT "true" → 该行 active=NULL →
        #    part_dict(WHERE active=TRUE) 读不到 → 零件无法路由。
        #    2026-10-13 实测：页面导入 13 行 active=NULL，字典 702 行只认出 689。
        #    规则：bool 列合并后仍为 None → 填 True（显式 False 不受影响）。
        cols = list(COLSPEC[table])

        def _val(c):
            v = merged.get(c)
            if v is None and COLSPEC[table][c][0] == "bool":
                return True
            return v

        full.append((cols, tuple(_val(c) for c in cols)))
    # v4.9：大批量走 Stream Load（不卡库），失败/小批量走 mysql 读-合并-整行
    objs = [{"cols": cols, "row": vals, "obj": dict(zip(cols, vals))} for cols, vals in full]
    if len(objs) >= SL_MIN_ROWS and SL_USER and SL_PASS:
        try:
            r = _stream_upsert(table, objs)
            print(f"[WRITE] {table} {r['mode']} {r['rows']} 行 chunks={r['chunks']} @ {datetime.now():%F %T}")
            return {"table": table, "rows": r["rows"], "affected": r["loaded"],
                    "mode": r["mode"], "note": "Stream Load 批量（UNIQUE KEY 按主键覆盖）"}
        except Exception as e:
            print(f"[WRITE] {table} stream load 失败，回退 mysql: {e}")
    n = 0
    for i in range(0, len(full), 100):
        batch = full[i:i + 100]
        cols = batch[0][0]
        if any(c[0] != cols for c in batch):
            return {"error": "合并后列集合不一致（不应发生），请分批提交"}
        ph = ",".join(["%s"] * len(cols))
        head = f"INSERT INTO `{table}` ({', '.join('`' + c + '`' for c in cols)}) VALUES "
        n += _exec(head + ",".join(f"({ph})" for _ in batch),
                   [v for _, vals in batch for v in vals])
    print(f"[WRITE] {table} merge-upsert {len(full)} 行(旧行命中 {len([k for k in key_tuples if k in old_map])}) "
          f"@ {datetime.now():%F %T}")
    return {"table": table, "rows": len(full), "affected": n,
            "note": "读-合并-整行INSERT：未提供的列保留旧值，不会被重置"}

def _merge_insert(table: str, key: dict, changes: dict) -> dict:
    """跨 Doris 版本的更新写法：SELECT 整行 → 合并改动 → 整行 INSERT。
    UNIQUE KEY 模型下同主键 INSERT = 覆盖旧行，因此【不需要 UPDATE 语句】。
    （UPDATE 在 Doris <1.2 不支持、且 SET 自引用表达式各版本行为不一；此写法全版本可用）"""
    if table not in COLSPEC or table == "sc_credential":
        return {"error": f"不允许写入 {table}"}
    spec = COLSPEC[table]
    unknown = [k for k in changes if k not in spec]
    if unknown:
        return {"error": f"未知列 {unknown}"}
    if not key or not all(k in spec for k in key):
        return {"error": f"key 必须是 {table} 的键列"}
    where = " AND ".join(f"`{k}` = %s" for k in key)
    cur = _fetch(f"SELECT * FROM `{table}` WHERE {where}", tuple(key.values()), cap=1)
    if not cur["data"]:
        return {"error": f"{table} 中找不到记录: {key}（请先用 upsert_*/create_task 创建）"}
    row = dict(cur["data"][0])
    for k, v in changes.items():
        row[k] = v
    cols = [c for c in row.keys() if row[c] is not None]
    vals = [row[c] for c in cols]
    ph = ",".join(["%s"] * len(cols))
    n = _exec(f"INSERT INTO `{table}` ({', '.join('`' + c + '`' for c in cols)}) VALUES ({ph})", vals)
    print(f"[WRITE] {table} merge-insert key={key} @ {datetime.now():%F %T}")
    return {"table": table, "affected": n, "mode": "merge-insert(UNIQUE KEY 覆盖)"}

def _spec_hash(spec_text: str, url: str = None) -> str:
    """🔑 v5.1 算法：sha256(spec_text.strip() + "\n" + (url or "").strip())[:16]
    三处必须完全一致：本函数 / BFF specHash / parse_spec.parse。
    只改 url 同样触发"待解析"（url 是解析输入）。"""
    payload = (spec_text or "").strip() + "\n" + (url or "").strip()
    return hashlib.sha256(payload.encode()).hexdigest()[:16]

def ping() -> str:
    """Health check: verify Doris connectivity and current database."""
    r = _fetch("SELECT DATABASE() AS db, CURRENT_USER() AS usr")
    r["data"][0]["mcp_build"] = MCP_BUILD
    return _j(r)

def get_server_time() -> str:
    """Authoritative Doris server time. 🔴 Daily-run rule: the agent MUST call this
    FIRST (step 1) and use current_date_val as the run date — never trust the local clock."""
    return _j(_fetch("""SELECT NOW() AS current_dt,
                               CURRENT_DATE() AS current_date_val,
                               CURRENT_TIME() AS current_time_val,
                               UNIX_TIMESTAMP() AS current_unix_ts""", cap=1))

def list_config_tables() -> str:
    """List the supply-chain config tables (sc_*) visible to this MCP account, with row estimates."""
    ph = ",".join(["%s"] * len(READ_TABLES))
    r = _fetch(f"""SELECT TABLE_NAME, TABLE_COMMENT, TABLE_ROWS
                   FROM information_schema.tables
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ({ph})
                   ORDER BY TABLE_NAME""", tuple(READ_TABLES))
    return _j(r)

def describe_config_table(table_name: str) -> str:
    """Schema of one config table (columns/types/comments + CREATE statement).

    Args:
        table_name: one of sc_task / sc_part_cross_ref / sc_owner / sc_ship_rule / sc_run_log / sc_agent_run
    """
    if table_name not in READ_TABLES:
        return _j({"error": f"只允许查看 {sorted(READ_TABLES)}"})
    r1 = _fetch("""SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_COMMENT, COLUMN_KEY
                   FROM information_schema.columns
                   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
                   ORDER BY ORDINAL_POSITION""", (table_name,), cap=200)
    conn = get_connection()
    try:
        cur = conn.cursor(dictionary=True)
        cur.execute(f"SHOW CREATE TABLE `{table_name}`")
        stmt = (cur.fetchone() or {}).get("Create Table", "")
    finally:
        cur.close()
        conn.close()
    return _j({"table": table_name, "columns": r1["data"], "create_statement": stmt})

def show_buckets(table_name: str) -> str:
    """Show the bucket (tablet) layout of one config table: BUCKETS n from the DDL
    plus the live tablet count and size (null if the account lacks SHOW TABLET priv).

    Args:
        table_name: one of the sc_* config tables
    """
    if table_name not in READ_TABLES:
        return _j({"error": f"只允许查看 {sorted(READ_TABLES)}"})
    conn = get_connection()
    out = {"table": table_name, "distribution_key": None, "buckets_in_ddl": None,
           "tablet_count": None, "size": None}
    try:
        cur = conn.cursor(dictionary=True)
        try:
            cur.execute(f"SHOW CREATE TABLE `{table_name}`")
            ddl = (cur.fetchone() or {}).get("Create Table", "")
            m = re.search(r"DISTRIBUTED BY HASH\(([^)]*)\) BUCKETS (\d+)", ddl)
            if m:
                out["distribution_key"], out["buckets_in_ddl"] = m.group(1), int(m.group(2))
        except Exception as e:
            out["create_table_error"] = str(e)[:150]
        for key, stmt in (("tablet_count", f"SHOW TABLETS FROM `{table_name}`"),
                          ("size", f"SHOW DATA FROM `{table_name}`")):
            try:
                cur.execute(stmt)
                rows = cur.fetchall()
                out[key] = len(rows) if key == "tablet_count" else rows
            except Exception:
                out[key] = None          # 缺 SHOW TABLET 权限时降级，不影响主功能
        cur.close()
    finally:
        conn.close()
    out["note"] = "配置表数据量极小，BUCKETS 2~4 足够；tablet/size 为 null 表示账号无 SHOW TABLET 权限"
    return _j(out)

def get_tasks(include_inactive: bool = False) -> str:
    """Today's task list: task_code/seq/site/spec_text/freq/output_pattern/enters_matrix/collector_status/agent_status.
    Equivalent to queries.sql Q1.1 (frequency filtering is done by the caller)."""
    sql = """SELECT task_code, seq_no, task_name, site_code, url, spec_text, spec_hash, freq,
                    output_pattern, enters_matrix, collector_status, collector_module,
                    consecutive_failures, last_error, agent_status, agent_question,
                    active_thread_id, active
             FROM sc_task"""
    if not include_inactive:
        sql += " WHERE active = TRUE"
    sql += " ORDER BY seq_no"
    return _j(_fetch(sql, cap=100))

def get_tasks_changed_spec() -> str:
    """Tasks whose spec_text changed but spec_hash was not refreshed (sha256[:16] computed server-side).
    Equivalent to queries.sql Q1.2 -> triggers saic-task-onboarding."""
    r = _fetch("SELECT seq_no, task_code, task_name, site_code, url, spec_text, spec_hash, "
               "collector_status FROM sc_task WHERE active = TRUE ORDER BY seq_no", cap=100)
    out = []
    for t in r["data"]:
        h = _spec_hash(t["spec_text"] or "", t.get("url"))
        if not t["spec_hash"] or t["spec_hash"] != h:
            out.append({**t, "expected_hash": h})
    return _j({"rowCount": len(out), "data": out})

def get_tasks_needing_onboarding() -> str:
    """Tasks pending generation or broken (collector_status in pending/broken or consecutive_failures>=3).
    Equivalent to queries.sql Q1.3."""
    return _j(_fetch("""SELECT seq_no, task_code, task_name, site_code, url, spec_text,
                               collector_status,
                               consecutive_failures, last_error, agent_status, agent_question
                        FROM sc_task
                        WHERE active = TRUE
                          AND (collector_status IN ('pending','broken') OR consecutive_failures >= 3)
                        ORDER BY consecutive_failures DESC, seq_no""", cap=100))

def get_part_dict() -> str:
    """Full customer-part cross reference incl. owner (the field that decides scope & mail routing).
    Equivalent to queries.sql Q2.1. Call ONCE per run and cache in memory."""
    return _j(_fetch("""SELECT customer_part_no, hsac_drawing_no, part_name, owner
                        FROM sc_part_cross_ref WHERE active = TRUE
                        ORDER BY customer_part_no""", cap=5000))

def get_owners() -> str:
    """Owner -> email mapping for mail delivery. Equivalent to queries.sql Q2.2."""
    return _j(_fetch("SELECT owner_name, email, cc_emails, scope_note FROM sc_owner "
                     "WHERE active = TRUE ORDER BY owner_name", cap=500))

def get_ship_rules() -> str:
    """Factory shipping offset days (offset_days = -1/-2). Equivalent to queries.sql Q2.3."""
    return _j(_fetch("SELECT factory_code, source_tag, offset_days, calendar FROM sc_ship_rule "
                     "WHERE active = TRUE ORDER BY factory_code, source_tag", cap=100))

def check_dict_issues(part_numbers: list) -> str:
    """Dictionary health-check for today's part numbers (queries.sql Q3.1-Q3.5 in one call).

    Args:
        part_numbers: list of customer part numbers appearing in today's raw files (max 3000)
    Returns: missing_in_dict / blank_hsac / blank_name / blank_owner / owners_missing_email
    """
    parts = [str(p).strip() for p in (part_numbers or []) if str(p).strip()][:3000]
    if not parts:
        return _j({"error": "part_numbers 为空"})
    ph = ",".join(["%s"] * len(parts))
    d = _fetch(f"""SELECT customer_part_no, hsac_drawing_no, part_name, owner
                   FROM sc_part_cross_ref WHERE customer_part_no IN ({ph})""",
               tuple(parts), cap=3000)["data"]
    by = {r["customer_part_no"]: r for r in d}
    owners = set()
    blank_hsac, blank_name, blank_owner = [], [], []
    for r in d:
        if not r["hsac_drawing_no"]:
            blank_hsac.append(r["customer_part_no"])
        if not r["part_name"]:
            blank_name.append(r["customer_part_no"])
        if not r["owner"]:
            blank_owner.append(r["customer_part_no"])
        else:
            owners |= {o.strip() for o in re.split(r"[,，、;；/|\s]+", r["owner"]) if o.strip()}
    have_email = {r["owner_name"] for r in _fetch(
        "SELECT owner_name FROM sc_owner WHERE active = TRUE", cap=500)["data"]}
    return _j({
        "checked": len(parts),
        "missing_in_dict": sorted(set(parts) - set(by)),
        "blank_hsac": sorted(blank_hsac),
        "blank_name": sorted(blank_name),          # 仅提示，不影响计算
        "blank_owner": sorted(blank_owner),
        "owners_missing_email": sorted(owners - have_email),
    })

def get_run_log(run_date: str = None, task_code: str = None, limit: int = 50) -> str:
    """Recent collection run records (queries.sql Q4.1/Q4.2)."""
    where, params = [], []
    if run_date:
        where.append("run_date = %s"); params.append(run_date[:8])
    if task_code:
        where.append("task_seq = %s"); params.append(int(task_code))
    sql = """SELECT run_date, task_seq, task_code, status, output_file, row_count,
                    byte_count, factory_check, error_msg, started_at, finished_at
             FROM sc_run_log"""
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY run_date DESC, task_code LIMIT {int(min(limit, 200))}"
    return _j(_fetch(sql, tuple(params), cap=200))

def get_agent_runs(status: str = None, limit: int = 20) -> str:
    """Instruction queue / agent run history (v4 contract). status e.g. queued/need_info/running."""
    # 🔧 v5.3 修复：triggered_at 列在 v4.3 重建时已删除（改为 started_at），
    #    原 SQL 必然报 Unknown column 'triggered_at' → 本工具完全不可用（实测复现）。
    #    同时补 task_seqs（v5.0 引用键，task_codes 仅为标签快照）。
    sql = """SELECT run_id, kind, task_seqs, task_codes, thread_id, conversation_id,
                    triggered_by, principal_user, status, summary, started_at, finished_at
             FROM sc_agent_run"""
    params = ()
    if status:
        sql += " WHERE status = %s"; params = (status,)
    sql += f" ORDER BY started_at DESC LIMIT {int(min(limit, 100))}"
    return _j(_fetch(sql, params, cap=100))

def query_config(sql: str) -> str:
    """Guarded READ-ONLY query over config tables. Only SELECT/WITH/SHOW/DESCRIBE/EXPLAIN;
    every referenced table must be one of sc_task/sc_part_cross_ref/sc_owner/sc_ship_rule/
    sc_run_log/sc_agent_run; sc_credential is unreachable; max 500 rows.

    Args:
        sql: a single read-only SQL statement
    """
    s = sql.strip().rstrip(";").strip()
    up = s.upper()
    if ";" in s:
        return _j({"error": "不允许多条语句"})
    if not up.startswith(("SELECT", "WITH", "SHOW", "DESCRIBE", "EXPLAIN")):
        return _j({"error": "只允许只读查询"})
    for kw in ("INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE",
               "GRANT", "REVOKE", "INTO OUTFILE", "LOAD"):
        if re.search(rf"\b{kw}\b", up):
            return _j({"error": f"禁用关键字: {kw}"})
    if "SC_CREDENTIAL" in up:
        return _j({"error": "sc_credential 对 MCP 不可见"})
    for tbl in re.findall(r"\b(?:FROM|JOIN|UPDATE)\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?", s, re.I):
        if tbl.lower() not in READ_TABLES and tbl.lower() not in ("information_schema",):
            return _j({"error": f"表 {tbl} 不在 MCP 可读范围"})
    try:
        return _j(_fetch(s, cap=500))
    except Exception as e:
        return _j({"error": f"Query Error: {str(e)[:300]}"})

def upsert_part_refs(rows: list) -> str:
    """Insert/update customer-part cross reference (business fills owner/hsac/name here).
    Each row: {customer_part_no*, hsac_drawing_no, part_name, owner, active, note, updated_by}.
    Same customer_part_no = overwrite (Doris UNIQUE KEY). Max 500 rows."""
    for r in rows or []:
        r.setdefault("updated_at", _db_now())
    return _j(_upsert("sc_part_cross_ref", rows))

def upsert_owners(rows: list) -> str:
    """Insert/update owner -> email. Each row: {owner_name*, email*, cc_emails, scope_note, active}."""
    return _j(_upsert("sc_owner", rows))

def upsert_ship_rules(rows: list) -> str:
    """Insert/update shipping offset rules. Each row: {factory_code*, source_tag*(生产/代工), offset_days*(-1/-2), calendar, active}."""
    return _j(_upsert("sc_ship_rule", rows))

def create_task(task_seq: int, task_code: str, task_name: str, site_code: str, spec_text: str,
                url: str = None, freq: str = "daily", output_pattern: str = None,
                enters_matrix: bool = True) -> str:
    """Register a NEW collection task (v5.0: seq_no = primary key, required & unique).
    task_code is an editable business label (also uniqueness-checked)."""
    if _fetch("SELECT seq_no FROM sc_task WHERE seq_no = %s", (int(task_seq),), cap=1)["data"]:
        return {"error": f"序号 {task_seq} 已被占用（序号为主键，需唯一）"}
    if _fetch("SELECT task_code FROM sc_task WHERE task_code = %s", (task_code,), cap=1)["data"]:
        return {"error": f"task_code 已存在：{task_code}"}
    row = {"seq_no": int(task_seq), "task_code": task_code, "task_name": task_name,
           "site_code": site_code, "spec_text": spec_text, "url": url,
           "spec_hash": _spec_hash(spec_text, url), "freq": freq,
           "output_pattern": output_pattern, "enters_matrix": enters_matrix, "active": True}
    row = {k: v for k, v in row.items() if v is not None}
    n = _exec("""INSERT INTO sc_task (seq_no, task_code, task_name, site_code, url, spec_text,
                 spec_hash, freq, output_pattern, enters_matrix, active,
                 collector_status, agent_status)
                 VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending','queued')""",
              (row.get("seq_no"), row.get("task_code"), row.get("task_name"),
               row.get("site_code"), row.get("url"), row.get("spec_text"), row.get("spec_hash"),
               row.get("freq"), row.get("output_pattern"), row.get("enters_matrix"), True))
    print(f"[WRITE] create_task seq={task_seq} code={task_code} @ {datetime.now():%F %T}")
    return _j({"seq_no": int(task_seq), "task_code": task_code, "affected": n,
               "spec_hash": row.get("spec_hash"), "agent_status": "queued"})

def update_task(task_seq: int, spec_text: str = None, url: str = None, freq: str = None,
                task_name: str = None, output_pattern: str = None,
                enters_matrix: bool = None, active: bool = None,
                new_task_code: str = None) -> str:
    """Business edits a task (v5.0: by seq_no primary key).
    Changing spec_text recomputes spec_hash and sets agent_status='queued'.
    new_task_code: 仅改业务标签；历史 run 行保留旧标签快照，无需级联。"""
    if new_task_code:
        if _fetch("SELECT seq_no FROM sc_task WHERE task_code = %s AND seq_no <> %s",
                  (new_task_code, int(task_seq)), cap=1)["data"]:
            return {"error": f"task_code 已存在：{new_task_code}"}
    changes = {}
    if new_task_code:
        changes["task_code"] = new_task_code
    # 🔑 v5.1：spec_text 与 url 任一变化都要重算 spec_hash（新算法含 url）。
    #    取当前行补齐另一侧的值，避免只用单侧算出错误 hash。
    if spec_text is not None or url is not None:
        cur = _fetch("SELECT spec_text, url FROM sc_task WHERE seq_no = %s",
                     (int(task_seq),), cap=1)["data"]
        cur_spec = spec_text if spec_text is not None else (cur[0].get("spec_text") if cur else "")
        cur_url = url if url is not None else (cur[0].get("url") if cur else None)
        if spec_text is not None:
            changes["spec_text"] = spec_text
        if url is not None:
            changes["url"] = url
        changes.update(spec_hash=_spec_hash(cur_spec, cur_url),
                       agent_status="queued",
                       spec_updated_at=_db_now())
    for col, v in (("freq", freq), ("task_name", task_name), ("output_pattern", output_pattern)):
        if v is not None:
            changes[col] = v
    if enters_matrix is not None:
        changes["enters_matrix"] = enters_matrix in _TRUE
    if active is not None:
        changes["active"] = active in _TRUE
    if not changes:
        return _j({"error": "没有要更新的字段"})
    return _j(_merge_insert("sc_task", {"seq_no": int(task_seq)}, changes))

def set_task_agent_state(task_seq: int, status: str, question: str = None,
                         answer: str = None, session_id: str = None,
                         parse_result_json: str = None) -> str:
    """Write back the agent-side state machine (v4.4).
    status in idle/queued/running/need_info/done/failed.
    need_info -> agent_question holds the question for a human; attempts += 1.
    done/failed -> agent_finished_at stamped. Read-merge-insert, no UPDATE.
    🔴 v4.4：无 thread_id 参数。sc_task.active_thread_id 是【任务工作会话】指针。
    v4.7 写入者仅两处：① BFF：onboard 族触发时领养其运行 thread；
    ② MCP：status=need_info 时领养"在等人的那个运行"的 thread（唯一豁免）。
    普通 autorun 正常结束不写指针。"""
    if status not in AGENT_STATUS:
        return _j({"error": f"status 必须是 {sorted(AGENT_STATUS)}"})
    now = _db_now()
    changes = {"agent_status": status}
    if question is not None:
        changes["agent_question"] = question[:8000]
    if answer is not None:
        changes["agent_answer"] = answer[:8000]
    if session_id is not None:
        changes["agent_session_id"] = session_id[:64]
    if parse_result_json is not None:
        changes["parse_result"] = parse_result_json
    # 🔴 v4.9 回写契约校验：done/failed 必须带结构化 result_json，缺键拒收（防"口头完成"）
    if status in ("done", "failed"):
        try:
            rj = json.loads(parse_result_json) if parse_result_json else None
        except Exception:
            rj = None
        need = ["intent", "before_hash", "after_hash", "gate", "promoted", "files_changed"]
        if not isinstance(rj, dict) or any(k not in rj for k in need):
            return {"error": f"status={status} 需要 result_json 含键 {need}（见 build_context.py 验证清单 f）；"
                             f"当前: {sorted(rj.keys()) if isinstance(rj, dict) else type(rj).__name__}"}
        if rj.get("gate") and isinstance(rj["gate"], dict):
            g = rj["gate"]
            if not (g.get("verify") and (g.get("golden_pivot") or g.get("verify_only"))):
                return {"error": "result_json.gate 未全过（verify 与 golden_pivot/verify_only 必须为真）"}
    if status == "need_info":
        cur = _fetch("SELECT agent_attempts FROM sc_task WHERE seq_no = %s",
                     (int(task_seq),), cap=1)["data"]
        changes["agent_attempts"] = int((cur[0]["agent_attempts"] if cur else 0) or 0) + 1
        # 🔑 v4.7 例外（对 v4.4「lane R 不写指针」的唯一豁免）：
        #    哪个运行在等人，它的 thread 就领养为任务的工作会话，
        #    这样人在抽屉里的回复能抵达那个对话（autorun 也适用）。
        run = _fetch("SELECT thread_id FROM sc_agent_run "
                     "WHERE (task_seqs LIKE %s OR task_codes LIKE %s) AND status = 'running' "
                     "ORDER BY started_at DESC LIMIT 1",
                     (f"%{int(task_seq)}%", f"%{task_seq}%"), cap=1)["data"]
        if run and run[0].get("thread_id"):
            changes["active_thread_id"] = run[0]["thread_id"]
    if status in ("done", "failed"):
        changes["agent_finished_at"] = now
    if status == "running":
        changes["agent_started_at"] = now
    r = _merge_insert("sc_task", {"seq_no": int(task_seq)}, changes)
    print(f"[WRITE] agent_state seq={task_seq} -> {status} @ {now}")
    return _j({**r, "seq_no": int(task_seq), "status": status})

def insert_run_log(run_date: str, task_seq: int, status: str, task_code: str = None,
                   output_file: str = None, row_count: int = None, byte_count: int = None,
                   factory_check: str = None, error_msg: str = None) -> str:
    """Append one collection-run result row (v5.0: UNIQUE(run_date, task_seq);
    task_code = label snapshot of this run; renaming does not rewrite history)."""
    now = _db_now()
    row = {"run_date": run_date, "task_seq": int(task_seq), "task_code": task_code,
           "status": status,
           "output_file": output_file, "row_count": row_count, "byte_count": byte_count,
           "factory_check": factory_check, "error_msg": (error_msg or None) and error_msg[:1000],
           "finished_at": now}
    row = {k: v for k, v in row.items() if v is not None}
    cols, vals = _clean("sc_run_log", row)
    ph = ",".join(["%s"] * len(cols))
    n = _exec(f"INSERT INTO sc_run_log ({', '.join('`' + c + '`' for c in cols)}) VALUES ({ph})", vals)
    return _j({"affected": n, "run_date": run_date, "task_seq": int(task_seq)})

def insert_agent_run(run_id: str, triggered_by: str, task_seqs: str = None,
                     status: str = "running", kind: str = None, thread_id: str = None,
                     principal_user: str = None, summary: str = None,
                     task_codes: str = None) -> str:
    """Open an episode/autorun ledger row (v4.3).
    kind: debug(页面调试会话,thread=active_thread_id) / autorun(每日定时运行) /
    onboard(新增/改描述的执行)。🔴 autorun/onboard 的 thread 只记在本表，不写 active_thread_id。
    （历史值 'episode' 等价于 debug。）
    thread_id = ChatKit thread 指针。🔴 对话原文由平台 thread 保存，本表不存副本
    （无 payload/question/answer 列）。"""
    row = {"run_id": run_id, "triggered_by": triggered_by,
           "task_seqs": task_seqs, "task_codes": task_codes,
           "status": status, "kind": kind,
           "thread_id": thread_id, "principal_user": principal_user,
           "summary": (summary or None) and summary[:500],
           "started_at": _db_now()}
    row = {k: v for k, v in row.items() if v is not None}
    cols, vals = _clean("sc_agent_run", row)
    ph = ",".join(["%s"] * len(cols))
    n = _exec(f"INSERT INTO sc_agent_run ({', '.join('`' + c + '`' for c in cols)}) VALUES ({ph})", vals)
    return _j({"affected": n, "run_id": run_id})

def update_agent_run(run_id: str, status: str = None, result_json: str = None,
                     mark_finished: bool = False, summary: str = None,
                     thread_id: str = None) -> str:
    """Close/update an episode/autorun ledger row (v4.3).
    result_json = 机器结论(gate/shadow/verify)。🔴 无 question/answer 参数：
    问答原文在平台 thread，本表只存状态/指针/结论。
    Read-merge-insert, no UPDATE statement."""
    changes = {}
    if summary is not None:
        changes["summary"] = summary[:500]
    if thread_id is not None:
        changes["thread_id"] = thread_id[:64]
    if status is not None:
        if status not in AGENT_STATUS:
            return _j({"error": f"status 必须是 {sorted(AGENT_STATUS)}"})
        changes["status"] = status
    if result_json is not None:
        changes["result_json"] = result_json
    if mark_finished:
        changes["finished_at"] = _db_now()
    if not changes:
        return _j({"error": "没有要更新的字段"})
    return _j(_merge_insert("sc_agent_run", {"run_id": run_id}, changes))


SL_MIN_ROWS = 500
SL_USER = SL_PASS = ''
request = json.load(sys.stdin)
responses = iter(request.get('responses', []))
calls = []
def _fetch(sql, params=None, cap=500):
    calls.append({'kind': 'fetch', 'sql': sql, 'params': list(params or []), 'cap': cap})
    data = next(responses, [])
    return {'rowCount': len(data), 'truncated': len(data) > cap, 'data': data[:cap]}
def _exec(sql, params=None):
    calls.append({'kind': 'exec', 'sql': sql, 'params': list(params or [])})
    return request.get('affected', 1)
class OfflineCursor:
    def execute(self, sql):
        self.data = next(responses, [])
        cap = 1 if sql.startswith('SHOW CREATE') else 50000
        calls.append({'kind': 'fetch', 'sql': sql, 'params': [], 'cap': cap})
    def fetchone(self): return self.data[0] if self.data else None
    def fetchall(self): return self.data
    def close(self): pass
class OfflineConnection:
    def cursor(self, **kwargs): return OfflineCursor()
    def close(self): pass
def get_connection(): return OfflineConnection()
def _db_now(): return '2026-10-15 12:34:56'
# Suppress source write diagnostics, retain only machine-readable oracle output.
import contextlib, io
try:
    with contextlib.redirect_stdout(io.StringIO()):
        result = globals()[request['name']](**request.get('input', {}))
    if isinstance(result, str): result = json.loads(result)
    print(json.dumps({'result': result, 'calls': calls}, ensure_ascii=False))
except Exception as error:
    print(json.dumps({'exception': type(error).__name__, 'calls': calls}))
