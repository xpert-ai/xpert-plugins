from __future__ import annotations

import io
import re
import zipfile

from openpyxl import load_workbook

from .contracts import BusinessError, HEADERS, MAX_FILE_BYTES, MAX_ROWS, bounded_text, cents, parse_time


def parse_workbook(content, file_name):
    if not isinstance(content, bytes) or not content or len(content) > MAX_FILE_BYTES:
        raise BusinessError("invalid_file", "请上传不超过 10 MiB 的 Excel 文件。")
    if not file_name.lower().endswith(".xlsx"):
        raise BusinessError("invalid_file", "仅支持 .xlsx 文件。")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 1500 or sum(x.file_size for x in entries) > 64 * 1024 * 1024:
                raise BusinessError("invalid_file", "文件解压后过大，请减少内容后重试。")
            if any(x.flag_bits & 1 for x in entries):
                raise BusinessError("invalid_file", "不支持加密文件。")
        book = load_workbook(io.BytesIO(content), read_only=True, data_only=False, keep_links=False)
    except BusinessError:
        raise
    except Exception:
        raise BusinessError("invalid_file", "无法读取 Excel，请确认文件完整且未加密。")
    issues, records, ids = [], [], set()
    try:
        sheet = book.worksheets[0]
        if sheet.max_row and sheet.max_row > MAX_ROWS + 1:
            raise BusinessError("too_many_rows", "首个工作表最多支持 5000 行交易，请移除多余的格式化空行。")
        if sheet.max_column and sheet.max_column > len(HEADERS):
            raise BusinessError("invalid_headers", "工作表只能包含标准模板的 7 至 8 列，请移除额外列。")
        rows = sheet.iter_rows()
        header = next(rows, ())
        names = [str(c.value or "").strip() for c in header]
        while names and not names[-1]:
            names.pop()
        required = HEADERS[:-1]
        if names not in (required, HEADERS):
            raise BusinessError("invalid_headers", "表头或顺序不正确，请使用标准模板。", {"expectedHeaders": HEADERS})
        for row_number, row in enumerate(rows, start=2):
            if row_number > MAX_ROWS + 1:
                raise BusinessError("too_many_rows", "首个工作表最多支持 5000 行交易。")
            if not any(c.value is not None for c in row):
                continue
            cells = list(row[:len(names)])
            if len(cells) < len(required):
                issues.append({"row": row_number, "field": "整行", "message": "必填列缺失。"})
                continue
            values = [c.value for c in cells]
            try:
                if any(c.data_type == "f" for c in row):
                    raise BusinessError("invalid_row", "不接受公式单元格，请粘贴为值。")
                transaction_id = bounded_text(values[0], "交易编号", 128)
                if transaction_id in ids:
                    raise BusinessError("invalid_row", "交易编号重复。")
                ids.add(transaction_id)
                paid_at = parse_time(values[1])
                payer = bounded_text(values[2], "付款账号", 128)
                payer_name = bounded_text(values[3], "付款方名称", 80)
                payee = bounded_text(values[4], "收款账号", 128)
                payee_name = bounded_text(values[5], "收款方名称", 80)
                if any(not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9 _-]*", x) for x in [payer, payee]):
                    raise BusinessError("invalid_row", "账号只能包含字母、数字、空格、下划线和短横线。")
                amount = cents(values[6])
                if amount <= 0:
                    raise BusinessError("invalid_row", "交易金额必须大于零。")
                note = "" if len(values) < 8 or values[7] is None else bounded_text(values[7], "交易摘要", 500, False)
                if any(c.value is not None for c in row[len(names):]):
                    raise BusinessError("invalid_row", "标准列之外存在数据，请移除额外列。")
                records.append((transaction_id, paid_at, payer, payer_name, payee, payee_name, amount, note, row_number))
            except (BusinessError, ValueError, TypeError) as error:
                issues.append({"row": row_number, "field": "交易记录", "message": str(error)})
        if issues:
            raise BusinessError("validation_failed", f"发现 {len(issues)} 行错误，未导入任何交易。", {"issues": issues[:100], "issueCount": len(issues)})
        if not records:
            raise BusinessError("empty_file", "文件没有交易记录。")
        return records, sheet.title
    finally:
        book.close()
