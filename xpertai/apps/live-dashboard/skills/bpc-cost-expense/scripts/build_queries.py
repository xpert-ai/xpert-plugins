#!/usr/bin/env python3
"""Build monthly BPC queries from explicit model mappings, without network access."""

import argparse
from copy import deepcopy
from datetime import date
import json
from pathlib import Path
import re


CONTRACT = "bpc-cost-expense-v1"
DIMENSIONS = ("CATEGORY", "PLANYEAR", "TIME", "ENTITY", "ACCOUNT", "RPTCURRENCY")
ACCOUNT_CODES = (
    "AC0412010000", "AC0412020000", "AC0412030000",
    "AC0412040000", "AC0412050000", "AC0412060000",
)
TOKEN = r"\[(?:[^\[\]]|\]\])+\]"
UNIQUE_NAME = re.compile(TOKEN + r"(?:\.&?" + TOKEN + r")*")


def text_value(value, label):
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError(f"{label} must be a nonempty string without outer whitespace")
    if any(ord(char) < 32 for char in value):
        raise ValueError(f"{label} must not contain control characters")
    return value


def unique_name(value, label):
    text_value(value, label)
    if not UNIQUE_NAME.fullmatch(value):
        raise ValueError(f"{label} must be one exact native unique name, not an expression")
    return value


def object_value(value, label, keys=None):
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    if keys is not None and set(value) != set(keys):
        raise ValueError(f"{label} must contain exactly: {', '.join(keys)}")
    return value


def member_map(value, label, allow_empty=False):
    object_value(value, label)
    if not value and not allow_empty:
        raise ValueError(f"{label} must contain the required current members")
    for key, member in value.items():
        text_value(key, label + " key")
        unique_name(member, label + " member")
    if len(set(value.values())) != len(value):
        raise ValueError(f"{label} has duplicate member identities")


def validate_binding(binding):
    object_value(binding, "binding", (
        "contract", "example_only", "source_hint", "measure", "dimensions",
        "account_axis", "members", "fixed_slicers",
    ))
    if binding["contract"] != CONTRACT:
        raise ValueError("Unsupported semantic contract")
    if not isinstance(binding["example_only"], bool):
        raise ValueError("example_only must explicitly be true or false")
    source = object_value(binding["source_hint"], "source_hint", ("resourceId", "target"))
    text_value(source["resourceId"], "source_hint.resourceId")
    target = object_value(source["target"], "target", ("entityTypeCode", "entityRef"))
    if target["entityTypeCode"] != "semantic_cube":
        raise ValueError("target must explicitly select semantic_cube")
    text_value(target["entityRef"], "target.entityRef")
    unique_name(binding["measure"], "measure")
    dims = object_value(binding["dimensions"], "dimensions", DIMENSIONS)
    for key, value in dims.items():
        unique_name(value, f"dimensions.{key}")
    if len(set(dims.values())) != len(DIMENSIONS):
        raise ValueError("Logical dimensions must map to distinct native dimensions")
    axis = object_value(binding["account_axis"], "account_axis", ("hierarchy", "level"))
    for key, value in axis.items():
        unique_name(value, "account_axis." + key)
    members = object_value(binding["members"], "members", (
        "actual_category", "actual_plan_year", "budget_versions", "plan_years",
        "months", "entities", "currencies", "cost_accounts",
    ))
    for role in ("actual_category", "actual_plan_year"):
        unique_name(members[role], "members." + role)
    for role in ("budget_versions", "plan_years", "months", "entities", "currencies", "cost_accounts"):
        member_map(members[role], "members." + role, allow_empty=role == "entities")
    if members["actual_category"] in members["budget_versions"].values():
        raise ValueError("An actual member cannot also be a budget version")
    if members["actual_plan_year"] in members["plan_years"].values():
        raise ValueError("Actual planning year cannot also be a budget planning year")
    if set(members["cost_accounts"]) != set(ACCOUNT_CODES):
        raise ValueError("cost_accounts must map exactly the six contract account codes")
    for year in members["plan_years"]:
        if not re.fullmatch(r"[0-9]{4}", year) or not 1 <= int(year) <= 9999:
            raise ValueError("Plan-year keys must be YYYY")
    for month in members["months"]:
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", month):
            raise ValueError("Month keys must be YYYY-MM")
        date.fromisoformat(month + "-01")
    if not isinstance(binding["fixed_slicers"], list):
        raise ValueError("fixed_slicers must be an array")
    used_fields = set(dims.values())
    for fixed in binding["fixed_slicers"]:
        object_value(fixed, "fixed_slicer", ("field", "value"))
        unique_name(fixed["field"], "fixed_slicer.field")
        unique_name(fixed["value"], "fixed_slicer.value")
        if fixed["field"] in used_fields:
            raise ValueError("A fixed slicer cannot duplicate or override another dimension")
        used_fields.add(fixed["field"])


def build_queries(binding, budget_version, plan_year, month, currency, entity=None, account_code=None):
    validate_binding(binding)
    members = binding["members"]
    dims = binding["dimensions"]

    def selected(role, key):
        if not isinstance(key, str) or key not in members[role]:
            raise ValueError(f"Selection is not in the verified {role} mapping")
        return members[role][key]

    budget = selected("budget_versions", budget_version)
    year = selected("plan_years", plan_year)
    shared = [("TIME", [selected("months", month)])]
    if entity is not None:
        shared.append(("ENTITY", [selected("entities", entity)]))
    accounts = ([selected("cost_accounts", account_code)] if account_code is not None
                else [members["cost_accounts"][code] for code in ACCOUNT_CODES])
    shared.extend([("ACCOUNT", accounts), ("RPTCURRENCY", [selected("currencies", currency)])])

    def params(category, plan, title):
        selections = [("CATEGORY", [category]), ("PLANYEAR", [plan])] + shared
        slicers = [{"field": dims[key], "op": "in", "value": list(values)} for key, values in selections]
        slicers.extend({"field": item["field"], "op": "in", "value": [item["value"]]}
                       for item in binding["fixed_slicers"])
        return {
            "title": title,
            "dimensions": [{"dimensionId": dims["ACCOUNT"], **binding["account_axis"]}],
            "measures": [binding["measure"]], "slicers": slicers, "limit": 100,
        }

    return {
        "source_hint": deepcopy(binding["source_hint"]),
        "scope": {
            "contract": CONTRACT,
            "example_only": binding["example_only"],
            "live_validation_performed": False,
            "expected_account_members": list(accounts),
            "other_dimension_semantics_require_review": True,
        },
        "budget_params": params(budget, year, "Monthly production cost budget"),
        "actual_params": params(members["actual_category"], members["actual_plan_year"], "Monthly production cost actual"),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binding", type=Path, required=True, help="Current verified model mapping JSON")
    for key in ("budget-version", "plan-year", "month", "currency"):
        parser.add_argument("--" + key, required=True)
    parser.add_argument("--entity")
    parser.add_argument("--account-code")
    args = parser.parse_args()
    try:
        binding = json.loads(args.binding.read_text(encoding="utf-8"))
        result = build_queries(binding, args.budget_version, args.plan_year, args.month,
                               args.currency, args.entity, args.account_code)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
