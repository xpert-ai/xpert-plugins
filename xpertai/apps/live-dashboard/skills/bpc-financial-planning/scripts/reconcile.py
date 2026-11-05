"""Reconcile retained annual and monthly previews at their original signed precision."""

import argparse
from decimal import Decimal, localcontext
import json
from pathlib import Path
import re

ACCOUNT_CODES = ("AC01", "AC08", "AC05")
SCOPE_KEYS = ("source_version", "batch", "category", "plan_year", "report_year", "calendar_year", "currency")


def object_at(value, label):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def member_map(value, keys, label):
    mapping = object_at(value, label)
    if set(mapping) != set(keys):
        raise ValueError(f"{label} must map exactly the expected members")
    if any(not isinstance(item, str) or not item.strip() for item in mapping.values()):
        raise ValueError(f"{label} contains an empty or invalid identity")
    if len(set(mapping.values())) != len(mapping):
        raise ValueError(f"{label} contains duplicate member identities")
    return mapping


def preview(value, label):
    data = object_at(value, label)
    if data.get("complete") is not True or not isinstance(data.get("rows"), list):
        raise ValueError(f"{label} requires a successful complete preview and its rows")
    scope = object_at(data.get("scope"), f"{label}.scope")
    if any(not isinstance(scope.get(key), str) or not scope[key].strip() for key in SCOPE_KEYS):
        raise ValueError(f"{label} has an incomplete query scope")
    entity = scope.get("entity")
    if "entity" not in scope or (entity is not None and (not isinstance(entity, str) or not entity.strip())):
        raise ValueError(f"{label} must specify one organization or null for all")
    object_at(scope.get("extra_slicers"), f"{label}.scope.extra_slicers")
    return data


def read_rows(rows, accounts, months=None):
    expected = {"account", "amount"} if months is None else {"account", "amount", "month"}
    values = {}
    for raw in rows:
        row = object_at(raw, "row")
        if set(row) != expected:
            raise ValueError("Unexpected row shape or grain")
        account = row["account"]
        if not isinstance(account, str) or account not in accounts.values():
            raise ValueError("Unexpected account member")
        period = row.get("month")
        if months is not None and (not isinstance(period, str) or period not in months.values()):
            raise ValueError("Period is outside the verified leaf-month set")
        key = (account, period)
        if key in values:
            raise ValueError("Duplicate row at the requested grain")
        amount = row["amount"]
        if not isinstance(amount, str) or not re.fullmatch(r"[+-]?[0-9]+(?:\.[0-9]+)?", amount):
            raise ValueError("Expected the original signed decimal amount as a string")
        values[key] = Decimal(amount)
    return values


def reconcile(data):
    data = object_at(data, "input")
    annual = preview(data.get("annual"), "annual")
    monthly = preview(data.get("monthly"), "monthly")
    scope = annual["scope"]
    if scope != monthly["scope"]:
        raise ValueError("Annual and monthly previews have different query scopes")
    year = scope["calendar_year"]
    if not re.fullmatch(r"[0-9]{4}", year) or year == "0000":
        raise ValueError("Expected the calendar year of the selected report-year member")
    accounts = member_map(data.get("accounts"), ACCOUNT_CODES, "accounts")
    period_keys = [f"{year}-{n:02}" for n in range(1, 13)]
    months = member_map(data.get("months"), period_keys, "months")
    if scope["report_year"] in months.values():
        raise ValueError("Annual total cannot also be a leaf month")
    totals = read_rows(annual["rows"], accounts)
    details = read_rows(monthly["rows"], accounts, months)
    numbers = [*totals.values(), *details.values()]
    # Allow a carry across all twelve months and the final subtraction without decimal rounding.
    integer_digits = max((max(1, n.adjusted() + 1) for n in numbers), default=1)
    scale = max((max(0, -n.as_tuple().exponent) for n in numbers), default=0)
    result = {}
    with localcontext() as ctx:
        ctx.prec = integer_digits + scale + 2
        for code, account in accounts.items():
            total = totals.get((account, None))
            missing = [m for m in period_keys if (account, months[m]) not in details]
            present = [details[account, months[m]] for m in period_keys if (account, months[m]) in details]
            subtotal = sum(present) if present else None
            difference = total - subtotal if total is not None and subtotal is not None else None
            status = "missing_data"
            if difference is not None:
                status = "equal_for_returned_months" if difference == 0 else "mismatch"
            result[code] = {
                "annual": format(total, "f") if total is not None else None,
                "returned_month_sum": format(subtotal, "f") if subtotal is not None else None,
                "difference": format(difference, "f") if difference is not None else None,
                "status": status,
                "missing_months": missing,
            }
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(reconcile(json.loads(args.input.read_text(encoding="utf-8"))), indent=2))
    except (ValueError, OSError) as error:
        parser.exit(2, f"Reconciliation failed: {error}\n")
