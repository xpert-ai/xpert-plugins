"""Offline contract checks using synthetic model instances only."""

from copy import deepcopy
import json
from pathlib import Path
import subprocess
import sys
import unittest

from build_queries import ACCOUNT_CODES, build_queries


ROOT = Path(__file__).resolve().parents[1]


class QueryTests(unittest.TestCase):
    def setUp(self):
        self.binding = json.loads((ROOT / "references/runtime-binding.example.json").read_text())
        self.selection = dict(budget_version="BUD01", plan_year="2030", month="2030-01", currency="CNY")

    def query(self, **changes):
        return build_queries(self.binding, **{**self.selection, **changes})

    def slices(self, result, side):
        return {item["field"]: item["value"] for item in result[side + "_params"]["slicers"]}

    def test_independent_budget_actual_and_shared_scope(self):
        for entity in (None, "FACTORY_A"):
            for account in (None, *ACCOUNT_CODES):
                with self.subTest(entity=entity, account=account):
                    result = self.query(entity=entity, account_code=account)
                    budget, actual = self.slices(result, "budget"), self.slices(result, "actual")
                    self.assertEqual(budget["[CATEGORY]"], ["[CATEGORY].[BUD01]"])
                    self.assertEqual(actual["[CATEGORY]"], ["[CATEGORY].[A00]"])
                    self.assertEqual(budget["[PLANYEAR]"], ["[PLANYEAR].[2030]"])
                    self.assertEqual(actual["[PLANYEAR]"], ["[PLANYEAR].[DUMMY_PLANYEAR]"])
                    for field in set(budget) - {"[CATEGORY]", "[PLANYEAR]"}:
                        self.assertEqual(budget[field], actual[field])
                    self.assertEqual(len(budget["[ACCOUNT]"]), 1 if account else 6)
                    self.assertEqual("[ENTITY]" in budget, entity is not None)
                    self.assertFalse(result["scope"]["live_validation_performed"])
                    self.assertTrue(result["scope"]["example_only"])

    def test_unknown_or_multiple_selections_are_rejected(self):
        for selection in (
            {"budget_version": "A00"}, {"budget_version": "BUD01,BUD02"},
            {"budget_version": ["BUD01", "BUD02"]}, {"plan_year": "DUMMY_PLANYEAR"},
            {"month": "2030-13"}, {"month": "2030.TOTAL"}, {"month": "2030-03"},
            {"entity": "UNKNOWN"}, {"account_code": "ALL"}, {"currency": "UNKNOWN"},
        ):
            with self.subTest(selection=selection), self.assertRaises(ValueError):
                self.query(**selection)

    def test_period_is_not_rewritten_from_plan_year(self):
        result = self.query(month="2031-01")
        for side in ("budget", "actual"):
            self.assertEqual(self.slices(result, side)["[TIME]"], ["[TIME].[2031.01]"])

    def test_second_environment_supplies_every_native_identity(self):
        second = deepcopy(self.binding)
        second["measure"] = second["measure"].replace("[", "[ALT_")
        for section in ("dimensions", "account_axis"):
            second[section] = {key: value.replace("[", "[ALT_") for key, value in second[section].items()}
        for role, value in second["members"].items():
            second["members"][role] = ({key: member.replace("[", "[ALT_") for key, member in value.items()}
                                       if isinstance(value, dict) else value.replace("[", "[ALT_"))
        second["source_hint"]["resourceId"] = "second-model"
        second["source_hint"]["target"]["entityRef"] = "second-model::SECOND_CUBE"
        second["example_only"] = False
        result = build_queries(second, **self.selection)
        self.assertEqual(result["source_hint"], second["source_hint"])
        self.assertFalse(result["scope"]["example_only"])
        self.assertNotIn("example-cost-model", json.dumps(result))
        for side in ("budget", "actual"):
            params = result[side + "_params"]
            self.assertEqual(params["measures"], ["[ALT_Measures].[ALT_SignData]"])
            self.assertEqual(params["dimensions"][0]["dimensionId"], "[ALT_ACCOUNT]")
            self.assertTrue(all(item["field"].startswith("[ALT_") for item in params["slicers"]))
            self.assertTrue(all(value.startswith("[ALT_") for item in params["slicers"] for value in item["value"]))

    def test_other_fixed_slicers_apply_to_both_sides_without_override(self):
        self.binding["fixed_slicers"] = [{"field": "[OBJECT]", "value": "[OBJECT].[DUMMY]"}]
        result = self.query()
        for side in ("budget", "actual"):
            self.assertEqual(self.slices(result, side)["[OBJECT]"], ["[OBJECT].[DUMMY]"])
        self.binding["fixed_slicers"].append({"field": "[TIME]", "value": "[TIME].[2030.02]"})
        with self.assertRaises(ValueError): self.query()

    def test_mapping_errors_and_incomplete_account_contract_fail(self):
        base = deepcopy(self.binding)
        cases = [
            ("contract", "another-contract"), ("example_only", "false"),
            ("members", []), ("dimensions", {}), ("fixed_slicers", None),
        ]
        for key, value in cases:
            with self.subTest(key=key), self.assertRaises(ValueError):
                build_queries({**base, key: value}, **self.selection)
        del self.binding["members"]["cost_accounts"][ACCOUNT_CODES[0]]
        with self.assertRaises(ValueError): self.query()
        self.binding = deepcopy(base)
        self.binding["members"]["budget_versions"]["BUD01"] = self.binding["members"]["actual_category"]
        with self.assertRaises(ValueError): self.query()
        self.binding = deepcopy(base)
        self.binding["members"]["months"]["2030-13"] = "[TIME].[2030.13]"
        with self.assertRaises(ValueError): self.query()
        self.binding = deepcopy(base)
        self.binding["members"]["budget_versions"]["BUD01"] = "[CATEGORY].Members"
        with self.assertRaises(ValueError): self.query()

    def test_unique_name_padding_is_preserved_and_input_is_not_mutated(self):
        padded = "[ENTITY                 PARENTH1].[FACTORY_A                    /ENTITY]"
        self.binding["members"]["entities"]["FACTORY_A"] = padded
        before = deepcopy(self.binding)
        result = self.query(entity="FACTORY_A")
        self.assertEqual(self.slices(result, "budget")["[ENTITY]"], [padded])
        self.assertEqual(self.binding, before)

    def test_cli_requires_binding_and_produces_json(self):
        script = str(ROOT / "scripts/build_queries.py")
        result = subprocess.run([sys.executable, "-B", script, "--binding", str(ROOT / "references/runtime-binding.example.json"),
                                 "--budget-version", "BUD01", "--plan-year", "2030", "--month", "2030-01", "--currency", "CNY"],
                                capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout), self.query())
        missing = subprocess.run([sys.executable, "-B", script], capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)


if __name__ == "__main__":
    unittest.main()
