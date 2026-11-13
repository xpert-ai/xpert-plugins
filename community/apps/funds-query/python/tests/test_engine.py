import json
import tempfile
import unittest
from datetime import datetime, timezone, timedelta

from funds_engine.contracts import BusinessError, date_window, cents, money, validate_plan
from funds_engine.importer import parse_workbook
from funds_engine.storage import Store
from funds_engine.analytics import run_query, query_result
from fixtures import records, workbook, ZHANG, SECOND, COMPANY_A

SCOPE = {'tenantId': 'tenant-a', 'organizationId': 'org-a', 'userId': 'user-a'}


class EngineTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.store = Store(self.directory.name, SCOPE, datetime(2026, 11, 3, tzinfo=timezone.utc))
        self.content = workbook()
        self.dataset = self.store.import_file(self.content, '测试.xlsx')['dataset']['id']

    def tearDown(self):
        self.store.close()
        self.directory.cleanup()

    def query(self, **plan):
        return run_query(self.store, self.dataset, {'question': '测试查询', 'plan': {'accountIds': [ZHANG], 'period': 'last_month', **plan}})

    def test_exact_receipts_and_original_rows(self):
        r = self.query()
        self.assertEqual((r['amount'], r['count']), ('90000.13', 4))
        self.assertEqual([x['transactionId'] for x in r['evidence']['items']], ['T002', 'T003', 'T005', 'T009'])
        self.assertEqual(r['evidence']['items'][0]['sourceRow'], 3)

    def test_outflow_and_net_are_not_revenue(self):
        self.assertEqual(self.query(direction='out')['amount'], '10000.21')
        self.assertEqual(self.query(direction='net')['amount'], '79999.92')
        self.assertIn('不等同营业收入', self.query()['policy'])

    def test_selected_accounts_internal_transfer_is_zero_for_net(self):
        r = self.query(direction='net', accountIds=[ZHANG, SECOND])
        self.assertEqual((r['amount'], r['count']), ('83800.72', 9))

    def test_rank_and_monthly_trend(self):
        rank = self.query(kind='counterparties')
        self.assertEqual([x['amount'] for x in rank['groups']], ['60000.00', '20000.02', '10000.11'])
        trend = self.query(kind='trend', granularity='month')
        self.assertEqual(trend['groups'], [{'label': '2026-10', 'amount': '90000.13', 'count': 4}])

    def test_strict_amount_boundary(self):
        r = self.query(minAmount='60000', minExclusive=True)
        self.assertEqual((r['amount'], r['count']), ('0.00', 0))
        self.assertEqual(self.query(minAmount='60000', minExclusive=False)['count'], 1)

    def test_counterparty_and_time_boundaries(self):
        r = self.query(counterpartyName='甲公司')
        self.assertEqual((r['amount'], r['count']), ('10000.11', 2))
        self.assertEqual(self.query(period='custom', startDate='2026-10-31', endDate='2026-10-31')['amount'], '0.10')

    def test_same_name_requires_user_choice(self):
        ds = self.store.import_file(workbook(records(ambiguous=True)), '同名.xlsx')['dataset']['id']
        r = run_query(self.store, ds, {'question': '张三收款', 'plan': {'accountName': '张三'}})
        self.assertEqual(r['status'], 'needs_clarification')
        self.assertEqual(len(r['candidates']), 2)

    def test_unknown_name_does_not_masquerade_as_zero_income(self):
        r = run_query(self.store, self.dataset, {'plan': {'accountName': '不存在的人'}})
        self.assertEqual(r['status'], 'needs_clarification')
        self.assertEqual(r['candidates'], [])

    def test_followup_inherits_filters_and_can_clear_them(self):
        first = self.query(kind='transactions', minAmount='10000')
        r = run_query(self.store, self.dataset, {'question': '只看甲公司', 'baseQueryId': first['queryId'], 'plan': {'counterpartyName': '甲公司'}})
        self.assertEqual(r['amount'], '10000.01')
        r2 = run_query(self.store, self.dataset, {'baseQueryId': r['queryId'], 'clearFilters': ['minAmount'], 'plan': {}})
        self.assertEqual(r2['amount'], '10000.11')

    def test_evidence_pagination_stable_and_exhaustive(self):
        r = self.query()
        first = query_result(self.store, r['queryId'], 1, 2)
        second = query_result(self.store, r['queryId'], 2, 2)
        ids = [x['transactionId'] for x in first['evidence']['items'] + second['evidence']['items']]
        self.assertEqual(ids, ['T002', 'T003', 'T005', 'T009'])
        self.assertEqual(first['evidence']['total'], 4)

    def test_duplicate_import_and_query_are_idempotent(self):
        duplicate = self.store.import_file(self.content, '改名.xlsx')
        self.assertTrue(duplicate['reused'])
        self.assertEqual(duplicate['dataset']['id'], self.dataset)
        pending = self.store.prepare(self.dataset, '查询', 'operation-1')
        again = self.store.prepare(self.dataset, '查询', 'operation-1')
        self.assertEqual(pending['queryId'], again['queryId'])
        request = {'queryId': pending['queryId'], 'plan': {'accountIds': [ZHANG], 'period': 'last_month'}}
        run_query(self.store, self.dataset, request)
        self.assertTrue(run_query(self.store, self.dataset, request)['reused'])

    def test_persistence_survives_reopen(self):
        r = self.query()
        self.store.close()
        self.store = Store(self.directory.name, SCOPE)
        self.assertEqual(self.store.dataset()['id'], self.dataset)
        self.assertEqual(query_result(self.store, r['queryId'])['amount'], '90000.13')

    def test_scope_isolation_including_result_ids(self):
        query_id = self.query()['queryId']
        for key in ['tenantId', 'organizationId', 'userId']:
            other = Store(self.directory.name, {**SCOPE, key: 'other'})
            try:
                self.assertEqual(other.datasets()['total'], 0)
                with self.assertRaises(BusinessError): other.dataset(self.dataset)
                with self.assertRaises(BusinessError): other.question(query_id)
            finally: other.close()

    def test_sql_and_unknown_options_rejected(self):
        for plan in [{'sql': 'DROP TABLE transfers'}, {'kind': 'DROP TABLE'}, {'accountIds': []}, {'limit': 100000}, {'minAmount': 'NaN'}, {'direction': 'net', 'kind': 'counterparties'}]:
            with self.subTest(plan=plan), self.assertRaises(BusinessError): validate_plan(plan)
        r = self.query(counterpartyName="' OR 1=1 --")
        self.assertEqual(r['count'], 0)

    def test_error_is_saved_and_retry_works(self):
        question = self.store.prepare(self.dataset, '重试', 'retry-1')
        with self.assertRaises(BusinessError): run_query(self.store, self.dataset, {'queryId': question['queryId'], 'plan': {'sql': 'oops'}})
        self.assertEqual(self.store.question(question['queryId'])['status'], 'failed')
        r = run_query(self.store, self.dataset, {'queryId': question['queryId'], 'plan': {'accountIds': [ZHANG], 'period': 'last_month'}})
        self.assertEqual(r['amount'], '90000.13')

    def test_decimal_precision(self):
        self.assertEqual(cents('0.10') + cents('0.20'), 30)
        self.assertEqual(money(-1), '-0.01')
        for v in ['0.001', 'NaN', float('inf'), True, '-1']:
            with self.subTest(value=v), self.assertRaises(BusinessError): cents(v)

    def test_date_year_boundary_and_week_monday(self):
        p = {'period': 'last_month'}
        self.assertEqual(date_window(p, datetime(2026,1,3,tzinfo=timezone.utc)), ('2025-12-01 00:00:00','2026-01-01 00:00:00'))
        self.assertEqual(date_window({'period': 'last_week'}, datetime(2026,11,3,tzinfo=timezone.utc)), ('2026-10-26 00:00:00','2026-11-02 00:00:00'))

    def test_whole_import_rejected_when_any_row_invalid(self):
        bad = records()
        bad[1][6] = '-3'
        bad[2][2] = 6222000000000001
        bad[3][0] = bad[0][0]
        before = self.store.datasets()['total']
        with self.assertRaises(BusinessError) as caught: self.store.import_file(workbook(bad), '错误.xlsx')
        self.assertEqual(caught.exception.code, 'validation_failed')
        self.assertEqual(caught.exception.details['issueCount'], 3)
        self.assertEqual(before, self.store.datasets()['total'])

    def test_formulas_empty_and_broken_files_rejected(self):
        bad = records()
        bad[0][6] = '=SUM(1,2)'
        for data,name in [(workbook(bad),'公式.xlsx'), (workbook([]),'空.xlsx'), (b'not zip','损坏.xlsx'), (self.content,'伪装.xls')]:
            with self.subTest(name=name), self.assertRaises(BusinessError): parse_workbook(data,name)

    def test_max_row_limit(self):
        row = records()[0]
        good = [[f'B{i}', *row[1:]] for i in range(5000)]
        self.assertEqual(len(parse_workbook(workbook(good), '边界.xlsx')[0]), 5000)
        with self.assertRaises(BusinessError) as error: parse_workbook(workbook(good + [['B5000', *row[1:]]]), '超限.xlsx')
        self.assertEqual(error.exception.code, 'too_many_rows')

    def test_trend_truncation_retains_exact_group_count(self):
        from datetime import timedelta
        base = records()[0]
        rows = [[f'D{i}', (datetime(2026,1,1)+timedelta(days=i)).strftime('%Y-%m-%d %H:%M:%S'), *base[2:6], '1.00', '趋势边界'] for i in range(130)]
        ds = self.store.import_file(workbook(rows), '长期趋势.xlsx')['dataset']['id']
        r = run_query(self.store, ds, {'plan': {'kind': 'trend'}})
        self.assertEqual((r['groupCount'], len(r['groups']), r['amount']), (130, 120, '130.00'))
        self.assertTrue(r['groupsTruncated'])

    def test_exact_account_lookup_is_not_limited_by_substring_search_page(self):
        base = records()[0]
        rows = [[f'A{i}', base[1], f'000123{i:02d}', '对手', f'000123{i:02d}', '对手', '1.00', ''] for i in range(25)]
        rows.append(['EXACT',base[1],COMPANY_A,'甲公司','123','准确账户','9.00',''])
        ds = self.store.import_file(workbook(rows), '账号精确匹配.xlsx')['dataset']['id']
        r = run_query(self.store, ds, {'plan': {'accountIds': ['123']}})
        self.assertEqual((r['amount'],r['count']), ('9.00',1))

    def test_rank_drilldown_uses_exact_counterparty_account(self):
        first = self.query(kind='counterparties')
        counterparty = first['groups'][0]['accountId']
        r = run_query(self.store,self.dataset,{'baseQueryId':first['queryId'],'plan':{'kind':'transactions','counterpartyAccountId':counterparty}})
        self.assertEqual((r['amount'],r['count']),('60000.00',1))
        self.assertEqual(r['evidence']['items'][0]['transactionId'],'T005')

    def test_numeric_excel_money_is_accepted_but_account_stays_text(self):
        rows=records();rows[2][6]=20000.02
        ds=self.store.import_file(workbook(rows),'数字金额.xlsx')['dataset']['id']
        r=run_query(self.store,ds,{'plan':{'accountIds':[ZHANG],'period':'last_month'}})
        self.assertEqual(r['amount'],'90000.13')

    def test_compressed_workbook_expansion_limit(self):
        import io,zipfile
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as z:z.writestr('oversized.xml',b'0'*(65*1024*1024))
        with self.assertRaises(BusinessError) as error:parse_workbook(buf.getvalue(),'压缩体积.xlsx')
        self.assertEqual(error.exception.code,'invalid_file')

    def test_followup_does_not_shift_saved_window_when_month_changes(self):
        first=self.query()
        self.store.now=datetime(2026,12,3,tzinfo=timezone.utc)
        result=run_query(self.store,self.dataset,{'baseQueryId':first['queryId'],'plan':{}})
        self.assertEqual(result['amount'],'90000.13')
        self.assertEqual(result['window']['startInclusive'],'2026-10-01 00:00:00')

    def test_relative_period_uses_question_time_across_midnight(self):
        self.store.now=datetime(2026,11,30,15,59,59,tzinfo=timezone.utc)
        pending=self.store.prepare(self.dataset,'上个月收款','midnight-question')
        self.store.now=datetime(2026,11,30,16,0,5,tzinfo=timezone.utc)
        result=run_query(self.store,self.dataset,{'queryId':pending['queryId'],'plan':{'accountIds':[ZHANG],'period':'last_month'}})
        self.assertEqual(result['amount'],'90000.13')
        self.assertEqual(result['referenceTime'],'2026-11-30 23:59:59')

    def test_failed_base_query_cannot_silently_reset_filters(self):
        pending=self.store.prepare(self.dataset,'无效条件','failed-base')
        with self.assertRaises(BusinessError):run_query(self.store,self.dataset,{'queryId':pending['queryId'],'plan':{'sql':'not allowed'}})
        with self.assertRaises(BusinessError) as error:run_query(self.store,self.dataset,{'baseQueryId':pending['queryId'],'plan':{}})
        self.assertEqual(error.exception.code,'invalid_base_query')

    def test_wait_timeout_is_consistent_and_can_recover_with_late_result(self):
        pending = self.store.prepare(self.dataset, '等待中的问题', 'late-result')
        self.store.now += timedelta(seconds=181)
        result = query_result(self.store, pending['queryId'])
        history = self.store.history(self.dataset)['items'][0]
        self.assertEqual(result['status'], 'waiting_timeout')
        self.assertEqual(history['status'], result['status'])
        self.assertEqual(history['error'], result['error'])
        self.assertEqual(self.store.question(pending['queryId'])['status'], 'pending')
        completed = run_query(self.store, self.dataset, {
            'queryId': pending['queryId'],
            'plan': {'accountIds': [ZHANG], 'period': 'last_month'}
        })
        self.assertEqual(completed['amount'], '90000.13')
        self.assertEqual(query_result(self.store, pending['queryId'])['status'], 'completed')
        self.assertEqual(self.store.history(self.dataset)['items'][0]['status'], 'completed')


if __name__ == '__main__': unittest.main()
