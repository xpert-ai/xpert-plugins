"""Rebuild the pinned Tableau teaching dataset (requires xlrd==2.0.2).

Usage: python build_data.py --workbook /path/to/Sample-Superstore.xls
The original workbook is not modified. Only files in this recipe are generated.
"""
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from pathlib import Path

SHA256 = 'add4e193479cae8e9f22bfa734dd8bb706355dce38353967668f4e2b6643d19c'
ROOT = Path(__file__).resolve().parent
FIELDS = [
    'row_id', 'order_id', 'order_date', 'ship_date', 'ship_mode', 'customer_id',
    'customer_name', 'segment', 'country', 'city', 'state', 'postal_code', 'region',
    'product_id', 'category', 'sub_category', 'product_name', 'sales', 'quantity',
    'discount', 'profit', 'order_year', 'order_month', 'regional_manager',
    'returned', 'returned_order_id', 'returned_sales',
]
NUMERIC = {'sales', 'profit', 'discount', 'returned_sales'}
INTEGER = {'row_id', 'quantity'}


def money(value):
    # Excel binary floating-point noise is normalized at six decimal places.
    return Decimal(str(value)).quantize(Decimal('0.000001'))


def read_workbook(path):
    if hashlib.sha256(path.read_bytes()).hexdigest() != SHA256:
        raise ValueError('Workbook SHA-256 differs from the pinned Tableau release')
    import xlrd
    book = xlrd.open_workbook(str(path))
    orders, returns, people = [book.sheet_by_name(name) for name in ('Orders', 'Returns', 'People')]
    if orders.nrows - 1 != 10194 or orders.ncols != 21:
        raise ValueError('Unexpected Orders shape')
    return_ids = {str(returns.cell_value(i, 1)) for i in range(1, returns.nrows)}
    if len(return_ids) != 296 or returns.nrows - 1 != 800:
        raise ValueError('Unexpected Returns shape')
    managers = {}
    for i in range(1, people.nrows):
        name, region = people.row_values(i)
        if region in managers:
            raise ValueError('Duplicate region manager would multiply fact rows')
        managers[region] = name
    rows = []
    for i in range(1, orders.nrows):
        values = orders.row_values(i)
        row = dict(zip(FIELDS[:21], values))
        for key in ('order_date', 'ship_date'):
            row[key] = xlrd.xldate_as_datetime(row[key], book.datemode).date().isoformat()
        for key in NUMERIC - {'returned_sales'}:
            row[key] = money(row[key])
        for key in INTEGER:
            if row[key] != int(row[key]):
                raise ValueError('Non-integer identifier or quantity')
            row[key] = int(row[key])
        # Postal codes are labels, never numbers or measures.
        row['postal_code'] = str(int(row['postal_code'])).zfill(5) if isinstance(row['postal_code'], (int, float)) else str(row['postal_code'])
        row['order_year'], row['order_month'] = row['order_date'][:4], row['order_date'][:7]
        row['regional_manager'] = managers[row['region']]
        returned = row['order_id'] in return_ids
        row['returned'] = 'Yes' if returned else 'No'
        row['returned_order_id'] = row['order_id'] if returned else None
        row['returned_sales'] = row['sales'] if returned else Decimal('0.000000')
        rows.append(row)
    if len({r['row_id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate order-line primary key')
    if return_ids - {r['order_id'] for r in rows}:
        raise ValueError('Unmatched return order')
    return rows


def aggregate(rows):
    total = lambda field: str(sum((r[field] for r in rows), Decimal(0)).quantize(Decimal('0.000001')))
    return {
        'Sales': total('sales'), 'Profit': total('profit'),
        'Quantity': sum(r['quantity'] for r in rows),
        'Orders': len({r['order_id'] for r in rows}),
        'Customers': len({r['customer_id'] for r in rows}),
        'ReturnedOrders': len({r['returned_order_id'] for r in rows if r['returned_order_id']}),
        'ReturnedSales': total('returned_sales'),
    }


def write_json(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def build(rows):
    with (ROOT / 'orders.csv').open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    dimensions = {
        'OrderYear': ('order_year', '年份'), 'OrderMonth': ('order_month', '订单月份'),
        'Region': ('region', '区域'), 'Category': ('category', '品类'),
        'SubCategory': ('sub_category', '子品类'), 'Segment': ('segment', '客户分群'),
        'Returned': ('returned', '退货标记'), 'RegionalManager': ('regional_manager', '区域经理'),
    }
    measures = [
        ('Sales', 'sales', 'sum', '销售额（USD）'),
        ('Profit', 'profit', 'sum', '利润（USD）'),
        ('Quantity', 'quantity', 'sum', '商品件数'),
        ('Orders', 'order_id', 'distinct-count', '订单数'),
        ('Customers', 'customer_id', 'distinct-count', '客户数'),
        ('ReturnedOrders', 'returned_order_id', 'distinct-count', '退货订单数'),
        ('ReturnedSales', 'returned_sales', 'sum', '退货关联销售额（USD，非退款）'),
    ]
    write_json('semantic-model.json', {'cubes': [{
        'name': 'SuperstoreOrders', 'caption': 'Superstore 订单分析（演示）',
        'fact': {'type': 'table', 'table': {'name': 'superstore_orders_v1', 'schema': 'public'}},
        'defaultMeasure': 'Sales',
        'measures': [{'name': n, 'column': c, 'aggregator': a, 'caption': label,
                      'datatype': 'Numeric', 'visible': True} for n, c, a, label in measures],
        'dimensions': [{'name': name, 'caption': label, 'hierarchies': [{
            'name': name, 'hasAll': True,
            'levels': [{'name': name, 'column': column, 'type': 'String', 'uniqueMembers': True}],
        }]} for name, (column, label) in dimensions.items()],
    }]})
    cases = {'all': {}, 'west': {'region': 'West'}, 'east': {'region': 'East'},
             'year2024': {'order_year': '2024'}, 'furniture': {'category': 'Furniture'},
             'west2024furniture': {'region': 'West', 'order_year': '2024', 'category': 'Furniture'},
             'empty': {'order_year': '1999'}}
    expected = {'sourceSha256': SHA256, 'orderLines': len(rows), 'cases': {}}
    for key, filters in cases.items():
        selected = [r for r in rows if all(r[k] == v for k, v in filters.items())]
        item = {'filters': filters, 'rows': len(selected), 'totals': aggregate(selected), 'groups': {}}
        for dim, (column, _) in dimensions.items():
            groups = defaultdict(list)
            for row in selected:
                groups[row[column]].append(row)
            item['groups'][dim] = [{dim: member, **aggregate(group)} for member, group in sorted(groups.items())]
        expected['cases'][key] = item
    write_json('expected.json', expected)
    write_json('import.json', [{
        'catalog': 'public', 'name': 'superstore_orders_v1', 'withHeader': 1,
        'columns': [{'name': f, 'fieldName': f, 'isKey': f == 'row_id',
                     'type': 'decimal' if f in NUMERIC else 'integer' if f in INTEGER else 'varchar',
                     **({'precision': 20, 'fraction': 6} if f in NUMERIC else {'length': 512} if f not in INTEGER else {})}
                    for f in FIELDS],
    }])
    print(json.dumps({'rows': len(rows), 'totals': aggregate(rows),
                      'csvSha256': hashlib.sha256((ROOT / 'orders.csv').read_bytes()).hexdigest()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workbook', type=Path, required=True)
    args = parser.parse_args()
    build(read_workbook(args.workbook))
