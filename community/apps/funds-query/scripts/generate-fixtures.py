"""Generate synthetic, clearly labeled fixtures and independently specified expected answers."""
from datetime import datetime, timedelta
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'python'), str(ROOT/'python/tests')]
from fixtures import workbook, records, ZHANG, SECOND
from funds_engine.contracts import SHANGHAI

parser = argparse.ArgumentParser()
parser.add_argument('--anchor-date', default=datetime.now(SHANGHAI).strftime('%Y-%m-%d'))
args = parser.parse_args()
anchor = datetime.strptime(args.anchor_date, '%Y-%m-%d')
month_end = anchor.replace(day=1) - timedelta(days=1)
month = month_end.strftime('%Y-%m')
out = ROOT/'examples'
out.mkdir(exist_ok=True)
for name, rows in [('交易明细-标准样例.xlsx', records(anchor)), ('交易明细-同名账户.xlsx', records(anchor, True))]:
    (out/name).write_bytes(workbook(rows))
(out/'标准导入模板.xlsx').write_bytes(workbook([]))
bad = records(anchor)
bad[1][6] = '-3'
bad[2][2] = 6222000000000001
bad[3][0] = bad[0][0]
(out/'交易明细-错误样例.xlsx').write_bytes(workbook(bad))
expected = {
    'synthetic': True, 'anchorDate': args.anchor_date, 'analysisMonth': month,
    'account': ZHANG, 'secondAccount': SECOND,
    'receipts': {'amount':'90000.13','count':4,'transactionIds':['T002','T003','T005','T009'],'excelRows':[3,4,6,10]},
    'payments': {'amount':'10000.21','count':4},
    'net': {'amount':'79999.92','count':8},
    'selectedTwoAccountNet': {'amount':'83800.72','count':9},
    'receiptAbove50000': {'amount':'60000.00','count':1,'transactionIds':['T005']},
    'receiptRanking': [{'name':'乙公司','amount':'60000.00','count':1},{'name':'王五','amount':'20000.02','count':1},{'name':'甲公司','amount':'10000.11','count':2}],
    'errors': {'issueCount':3,'rows':[3,4,5]},
    'note':'所有人员、账户和交易均为合成测试数据。预期值为独立手工核算，不通过查询引擎计算。相对月份问题应在锚定日期所在月验收，其他时间请使用明确日期。'
}
(out/'expected-results.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2)+'\n')
print('Generated synthetic XLSX fixtures and independent expected results for',month)
