"""Independent checks of packaged CSV and aggregate baselines; no xlrd required."""
import csv
import hashlib
import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from build_data import read_workbook

ROOT = Path(__file__).resolve().parent


class SuperstoreDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with (ROOT / 'orders.csv').open() as source:
            cls.rows = list(csv.DictReader(source))
        cls.expected = json.loads((ROOT / 'expected.json').read_text())

    def test_provenance_and_unique_order_lines(self):
        provenance = json.loads((ROOT / 'provenance.json').read_text())
        self.assertEqual(hashlib.sha256((ROOT / 'orders.csv').read_bytes()).hexdigest(), provenance['csvSha256'])
        self.assertEqual(len(self.rows), 10194)
        self.assertEqual(len({row['row_id'] for row in self.rows}), 10194)
        self.assertEqual(min(row['order_date'] for row in self.rows), '2021-01-03')
        self.assertEqual(max(row['order_date'] for row in self.rows), '2024-12-30')

    def test_returns_do_not_multiply_facts(self):
        returned = {row['order_id'] for row in self.rows if row['returned'] == 'Yes'}
        self.assertEqual(len(returned), 296)
        for row in self.rows:
            self.assertEqual(row['returned_order_id'], row['order_id'] if row['returned'] == 'Yes' else '')
            self.assertEqual(Decimal(row['returned_sales']), Decimal(row['sales']) if row['returned'] == 'Yes' else 0)

    def test_all_filter_baselines_from_csv(self):
        for name, case in self.expected['cases'].items():
            with self.subTest(name=name):
                rows = [r for r in self.rows if all(r[k] == v for k, v in case['filters'].items())]
                self.assertEqual(len(rows), case['rows'])
                for field, measure in [('sales', 'Sales'), ('profit', 'Profit'), ('returned_sales', 'ReturnedSales')]:
                    self.assertEqual(sum((Decimal(r[field]) for r in rows), Decimal(0)), Decimal(case['totals'][measure]))
                for field, measure in [('order_id', 'Orders'), ('customer_id', 'Customers'), ('returned_order_id', 'ReturnedOrders')]:
                    self.assertEqual(len({r[field] for r in rows if r[field]}), case['totals'][measure])

    def test_counts_must_not_be_added_across_groups(self):
        case = self.expected['cases']['all']
        self.assertGreater(sum(row['Customers'] for row in case['groups']['OrderMonth']), case['totals']['Customers'])
        self.assertGreater(sum(row['Orders'] for row in case['groups']['SubCategory']), case['totals']['Orders'])
        tables = next(row for row in case['groups']['SubCategory'] if row['SubCategory'] == 'Tables')
        self.assertEqual(Decimal(tables['Profit']), Decimal('-17753.206100'))

    def test_changed_workbook_rejected_before_parsing(self):
        with tempfile.TemporaryDirectory() as directory:
            workbook = Path(directory) / 'wrong.xls'
            workbook.write_bytes(b'not the pinned workbook')
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                read_workbook(workbook)


if __name__ == '__main__':
    unittest.main()
