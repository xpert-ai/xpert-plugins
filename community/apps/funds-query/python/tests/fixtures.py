from datetime import datetime, timedelta
from io import BytesIO
from openpyxl import Workbook
from funds_engine.contracts import HEADERS

ZHANG = '6222000000000001'
SECOND = '6222000000000002'
LI = '6222000000000003'
WANG = '6222000000000004'
COMPANY_A = '6222000000000005'
COMPANY_B = '6222000000000006'


def records(anchor=datetime(2026, 11, 3), ambiguous=False):
    current = anchor.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last = current - timedelta(seconds=1)
    first = last.replace(day=1, hour=0, minute=0, second=0)
    second_name = '张三' if ambiguous else '赵六'
    def row(number, date, payer, name, payee, payee_name, amount, note='演示转账'):
        return [f'T{number:03d}', date.strftime('%Y-%m-%d %H:%M:%S'), payer, name, payee, payee_name, amount, note]
    return [
        row(1, first-timedelta(seconds=1), COMPANY_A, '甲公司', ZHANG, '张三', '100.00'),
        row(2, first, COMPANY_A, '甲公司', ZHANG, '张三', '10000.01'),
        row(3, first.replace(day=5), WANG, '王五', ZHANG, '张三', '20000.02'),
        row(4, first.replace(day=10), ZHANG, '张三', LI, '李四', '5000.01'),
        row(5, first.replace(day=15), COMPANY_B, '乙公司', ZHANG, '张三', '60000.00'),
        row(6, first.replace(day=20), ZHANG, '张三', SECOND, second_name, '3000.00'),
        row(7, first.replace(day=22), LI, '李四', SECOND, second_name, '800.80'),
        row(8, first.replace(day=23), ZHANG, '张三', WANG, '王五', '2000.00'),
        row(9, last, COMPANY_A, '甲公司', ZHANG, '张三', '0.10'),
        row(10, current, COMPANY_A, '甲公司', ZHANG, '张三', '888.00'),
        row(11, first.replace(day=25), WANG, '王五', LI, '李四', '777.77'),
        row(12, first.replace(day=28), ZHANG, '张三', LI, '李四', '0.20'),
    ]


def workbook(rows=None, headers=HEADERS):
    book = Workbook()
    sheet = book.active
    sheet.title = '交易明细'
    sheet.append(headers)
    for row in records() if rows is None else rows:
        sheet.append(row)
    sheet.freeze_panes = 'A2'
    widths = [18, 23, 25, 18, 25, 18, 20, 30]
    for i, width in enumerate(widths, start=1):
        sheet.column_dimensions[sheet.cell(1, i).column_letter].width = width
    from openpyxl.styles import Font, PatternFill, Alignment
    for c in sheet[1]:
        c.font = Font(color='FFFFFF', bold=True)
        c.fill = PatternFill('solid', fgColor='243B36')
        c.alignment = Alignment(vertical='center')
    sheet.row_dimensions[1].height = 25
    for row in sheet.iter_rows(min_row=2):
        for i in [0, 2, 4]:
            row[i].number_format = '@'
    sheet.auto_filter.ref = sheet.dimensions
    stream = BytesIO()
    book.save(stream)
    book.close()
    return stream.getvalue()
