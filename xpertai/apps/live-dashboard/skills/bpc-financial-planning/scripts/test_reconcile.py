"""Synthetic period and dimension regressions for the annual planning contract."""

from copy import deepcopy
import unittest

from reconcile import reconcile


def fixture():
    scope = dict(source_version="example-model-v1/cube/SignData", batch="refresh-1",
                 category="Budget A", plan_year="2030", report_year="FY total",
                 calendar_year="2031", currency="Example currency", entity=None, extra_slicers={})
    accounts = {"AC01": "Sales group", "AC08": "Expense group", "AC05": "Investment group"}
    months = {f"2031-{i:02}": f"Month member {i}" for i in range(1, 13)}
    annual = [{"account": member, "amount": value} for member, value in
              zip(accounts.values(), ("-10000000000000000000000000000.01", "12.25", "0"))]
    rows = [dict(row, month=months["2031-12"]) for row in annual]
    return dict(accounts=accounts, months=months, annual=dict(scope=scope, complete=True, rows=annual),
                monthly=dict(scope=deepcopy(scope), complete=True, rows=rows))


class FinancialPlanningTest(unittest.TestCase):
    def test_separate_years_and_december_only_preserve_missing_months(self):
        result = reconcile(fixture())
        self.assertEqual(result["AC01"]["returned_month_sum"], "-10000000000000000000000000000.01")
        self.assertEqual(result["AC01"]["status"], "equal_for_returned_months")
        self.assertEqual(result["AC08"]["missing_months"], [f"2031-{i:02}" for i in range(1, 12)])
        self.assertEqual(result["AC05"]["returned_month_sum"], "0")

    def test_mismatch_is_not_rounded_away(self):
        data = fixture()
        data["monthly"]["rows"].append(dict(account="Sales group", month="Month member 1", amount="-0.01"))
        result = reconcile(data)["AC01"]
        self.assertEqual((result["status"], result["difference"]), ("mismatch", "0.01"))

    def test_absent_group_is_not_assigned_zero(self):
        data = fixture()
        data["monthly"]["rows"].pop()
        data["annual"]["rows"].pop(1)
        result = reconcile(data)
        self.assertIsNone(result["AC05"]["returned_month_sum"])
        self.assertIsNone(result["AC08"]["difference"])
        self.assertEqual(result["AC05"]["status"], "missing_data")

    def test_stale_or_different_dimensions_are_rejected(self):
        for key, value in (("batch", "previous"), ("category", "Budget B"), ("plan_year", "2031"),
                           ("report_year", "another year"), ("currency", "other"), ("entity", "unit"),
                           ("source_version", "old cube"), ("extra_slicers", {"object": "unit"})):
            with self.subTest(key=key), self.assertRaises(ValueError):
                data = fixture()
                data["monthly"]["scope"][key] = value
                reconcile(data)

    def test_member_mapping_must_match_the_selected_environment(self):
        data = fixture()
        data["accounts"]["AC01"] = "[ALT].[   SALES ]"
        for side in ("annual", "monthly"):
            data[side]["rows"][0]["account"] = data["accounts"]["AC01"]
        self.assertEqual(reconcile(data)["AC01"]["status"], "equal_for_returned_months")
        data["monthly"]["rows"][0]["account"] = "[ALT].[SALES]"
        with self.assertRaises(ValueError):
            reconcile(data)

    def test_month_map_cannot_mix_compilation_year_or_duplicate_a_period(self):
        for bad_month in ("2030-12", "2031-13"):
            with self.subTest(month=bad_month), self.assertRaises(ValueError):
                data = fixture()
                data["months"][bad_month] = data["months"].pop("2031-12")
                reconcile(data)
        data = fixture()
        data["months"]["2031-12"] = data["months"]["2031-11"]
        with self.assertRaises(ValueError):
            reconcile(data)

    def test_wrong_grain_or_incomplete_preview_cannot_reconcile(self):
        for update in ({"month": "FY total"}, {"month": "special input period"},
                       {"month": "wrong-year month"}, {"account": "another group"},
                       {"amount": None}, {"amount": 1.25}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                data = fixture()
                data["monthly"]["rows"][0].update(update)
                reconcile(data)
        for side in ("monthly", "annual"):
            data = fixture()
            data[side]["rows"].append(data[side]["rows"][0])
            with self.assertRaises(ValueError):
                reconcile(data)
            data = fixture()
            data[side]["complete"] = False
            with self.assertRaises(ValueError):
                reconcile(data)


if __name__ == "__main__":
    unittest.main()
