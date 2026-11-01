"""Generate self-contained, inspectable HTML recipes and query plans. No data rows are embedded."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
THEME = ROOT.parent.parent / 'themes' / 'trend-workspace'
OPTIONS = {
    'year': [['', '全部年份']] + [[str(y), str(y)] for y in range(2021, 2025)],
    'region': [['', '全部区域']] + [[r, r] for r in ['Central', 'East', 'South', 'West']],
    'category': [['', '全部品类']] + [[c, c] for c in ['Furniture', 'Office Supplies', 'Technology']],
}
CONTROLS = [{'controlId': key, 'label': label, 'type': 'string', 'defaultValue': '',
             'allowedValues': [value for value, _ in OPTIONS[key]]}
            for key, label in [('year', '年份'), ('region', '区域'), ('category', '品类')]]
PAGES = [
    {'key': 'overview', 'title': '零售经营总览', 'description': '从经营结果到区域与品类贡献',
     'bindings': {'summary': [], 'trend': ['OrderMonth'], 'regions': ['Region'], 'categories': ['Category']},
     'panels': ['月度销售与利润', '区域销售贡献'], 'notes': ['USD · 独立总计保留订单和客户去重口径', 'USD · 同一筛选范围'],
     'dimension': '品类', 'table': '品类经营表现'},
    {'key': 'profitability', 'title': '商品盈利分析', 'description': '找到贡献利润的商品，以及高销售背后的亏损',
     'bindings': {'summary': [], 'subcategories': ['SubCategory']},
     'panels': ['子品类利润排序', '销售额与利润关系'], 'notes': ['USD · 红色表示负利润', '每个点代表一个子品类，悬停查看金额'],
     'dimension': '子品类', 'table': '子品类盈利明细'},
    {'key': 'customers', 'title': '客户与退货分析', 'description': '客户结构、订单价值与退货订单关联表现',
     'bindings': {'summary': [], 'segments': ['Segment'], 'regions': ['Region']},
     'panels': ['客户分群销售贡献', '各区域退货订单数'], 'notes': ['USD · 客户数在当前范围内去重', '按 Order ID 去重；不代表退货商品件数'],
     'dimension': '客户分群', 'table': '客户分群与退货明细'},
]
checks = []
for name, case in json.loads((ROOT / 'expected.json').read_text())['cases'].items():
    if name == 'empty':
        continue  # 1999 is an SDK/data test, outside the page's allowed years.
    checks.append({'case': name, 'controls': {
        'year': case['filters'].get('order_year', ''),
        'region': case['filters'].get('region', ''),
        'category': case['filters'].get('category', '')},
        'summary': {key: str(value) for key, value in case['totals'].items()}})
(ROOT / 'checks.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2) + '\n')
CSS = '/* Theme CSS is supplied by the pinned trend-workspace document library. */'
JS = (ROOT / 'page.js').read_text()
for page in PAGES:
    key = page['key']
    measures = ['Sales', 'Orders', 'Customers', 'ReturnedOrders', 'ReturnedSales'] if key == 'customers' else ['Sales', 'Profit', 'Orders', 'Customers']
    config = {**page, 'bindings': list(page['bindings']), 'options': OPTIONS, 'measures': measures}
    metrics = [('销售额（USD）', '订单行销售额合计'), ('利润（USD）', '订单行利润合计'),
               ('利润率', '利润 ÷ 销售额'), ('订单数', 'Order ID 去重'), ('客户数', 'Customer ID 去重')]
    if key == 'customers':
        metrics = [('客户数', 'Customer ID 去重'), ('订单数', 'Order ID 去重'),
                   ('客单价（USD）', '销售额 ÷ 订单数'), ('退货订单数', '退货 Order ID 去重'), ('退货订单占比', '退货订单数 ÷ 订单数')]
    filters = ''.join(f'<div class="filter-field"><label for="filter-{c["controlId"]}">{c["label"]}</label><select id="filter-{c["controlId"]}" data-dashboard-control="{c["controlId"]}" disabled></select></div>' for c in CONTROLS)
    metric_blocks = [f'<div class="metric"><p>{label}</p><output id="metric-{i}">—</output><small>{note}</small></div>' for i, (label, note) in enumerate(metrics)]
    cards = ''.join(metric_blocks)
    panels = ''.join(f'<section class="panel"><h2>{page["panels"][i]}</h2><p class="note">{page["notes"][i]}</p><div id="chart-{name}" class="chart" role="img" aria-label="{page["panels"][i]}"></div></section>' for i, name in enumerate(['primary', 'secondary']))
    headings = [page['dimension'], '销售额（USD）', '利润（USD）', '利润率']
    if key == 'profitability':
        headings += ['订单数', '客户数']
    if key == 'customers':
        headings = [page['dimension'], '销售额（USD）', '订单数', '客户数', '退货订单数', '退货订单占比', '退货关联销售额（USD）']
    heads = ''.join(f'<th scope="col">{heading}</th>' for heading in headings)
    table = f'<section class="details"><h2>{page["table"]}</h2><p class="note">USD · 同一筛选范围</p><div class="table-scroll" tabindex="0" role="region" aria-label="{page["table"]}"><table><thead><tr>{heads}</tr></thead><tbody id="details-rows"></tbody></table></div></section>'
    if key == 'overview':
        content = f'''<section class="hero"><h2>月度经营趋势</h2><p class="note">2021–2024 · USD · 销售额与利润分别使用独立刻度</p>
<h3 class="chart-heading">销售额（USD）</h3><div id="chart-primary" class="chart" role="img" aria-label="月度销售额"></div>
<h3 class="chart-heading profit">利润（USD）</h3><div id="chart-profit" class="chart chart-profit" role="img" aria-label="月度利润"></div></section>
<div class="lower-grid"><section class="region-panel"><h2>区域销售贡献</h2><p class="note">USD · 按销售额从高到低</p><div id="chart-secondary" class="chart" role="img" aria-label="区域销售贡献"></div></section>{table}</div>'''
    else:
        content = f'<div class="plots">{panels}</div><div class="full-details">{table}</div>'
    html = f'''<!doctype html>
<html lang="zh-Hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Superstore · {page['title']}</title><style>{CSS}</style></head>
<body data-page="{key}" data-dashboard-theme="trend-workspace@1"><main class="workspace">
<aside class="metric-rail"><header><span class="demo">Superstore 演示数据</span><h1>{page['title']}</h1><p class="description">{page['description']}</p></header><section class="metrics" aria-label="当前筛选主要指标">{cards}</section></aside>
<div class="analysis"><div class="filters" aria-label="分析筛选">{filters}</div>{content}
<p id="status" class="status" role="status">正在加载…</p>
<details class="methodology"><summary>数据与指标口径</summary><p>来源：Tableau Superstore 虚构教学工作簿，2021–2024 年，金额单位 USD。退货表先按订单去重，再关联订单行。退货关联销售额不等于退款或收入损失。利润率为合计利润除以合计销售额；订单数与客户数由后端在当前范围内去重，不能累加分组计数。各看板筛选状态独立。</p></details></div>
<footer><span>2021–2024 · 演示数据 · Data Xpert</span><span id="freshness">尚无当前查询结果</span></footer></main>
<script>const config={json.dumps(config, ensure_ascii=False, indent=2)};
{JS}</script></body></html>
'''
    if key != 'overview':
        theme = 'profit-atlas' if key == 'profitability' else 'customer-brief'
        prefix = 'atlas' if key == 'profitability' else 'brief'
        global_name = 'ProfitAtlas' if key == 'profitability' else 'CustomerBrief'
        description = '看清销售与利润之间的差距' if key == 'profitability' else '理解客户结构，关注退货表现'
        header = f'<header class="{prefix}-header"><div><h1>{page["title"]}</h1><p class="description">{description}</p><span class="demo">Superstore 演示数据 · 2021–2024</span></div><div class="filters" aria-label="分析筛选">{filters}</div></header>'
        if key == 'profitability':
            summary = f'<section class="atlas-metrics" aria-label="当前筛选主要指标">{cards}</section>'
            panel_specs = [('secondary', '销售额与利润关系', '每个点代表一个子品类，悬停查看金额'), ('primary', '子品类利润排名', 'USD · 红色表示负利润')]
            table = table.replace('USD · 同一筛选范围', '按利润升序 · 完整明细可滚动查看')
        else:
            summary = f'<section class="brief-metrics" aria-label="当前筛选主要指标"><div class="brief-primary-metrics">{"".join(metric_blocks[:3])}</div><div class="brief-return-metrics">{metric_blocks[4]}{metric_blocks[3]}</div></section>'
            panel_specs = [('primary', '<span class="section-number" aria-hidden="true">01</span>客户分群销售贡献', 'USD · 客户数在当前范围内去重'), ('secondary', '<span class="section-number" aria-hidden="true">02</span>各区域退货订单数', '按 Order ID 去重；不代表退货商品件数')]
        variant_panels = ''.join(f'<section class="panel"><h2>{title}</h2><p class="note">{note}</p><div id="chart-{name}" class="chart" role="img" aria-label="{page["panels"][0 if name == "primary" else 1]}"></div></section>' for name, title, note in panel_specs)
        script = JS.replace('window.TrendWorkspace', f'window.{global_name}').replace('TrendWorkspaceCharts', 'DashboardCharts')
        if key == 'customers':
            script = script.replace("dimension:'Segment',measure:'Sales',label:'销售额（USD）'", "dimension:'Segment',measure:'Sales',label:'销售额（USD）',palette:['blue','segment-two','segment-three']")
            script = script.replace("label:'退货订单数',decimals:0", "label:'退货订单数',decimals:0,palette:['returns']")
        html = f'''<!doctype html>
<html lang="zh-Hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Superstore · {page['title']}</title></head>
<body data-page="{key}" data-dashboard-theme="{theme}@1"><main class="workspace">{header}{summary}
<div class="analysis"><div class="{prefix}-plots">{variant_panels}</div><div class="full-details">{table}</div>
<p id="status" class="status" role="status">正在加载…</p>
<details class="methodology"><summary>数据与指标口径</summary><p>来源：Tableau Superstore 虚构教学工作簿，2021–2024 年，金额单位 USD。退货表先按订单去重，再关联订单行。退货关联销售额不等于退款或收入损失。利润率为合计利润除以合计销售额；订单数与客户数由后端在当前范围内去重，不能累加分组计数。各看板筛选状态独立。</p></details></div>
<footer><span>2021–2024 · 演示数据 · Data Xpert</span><span id="freshness">尚无当前查询结果</span></footer></main>
<script>const config={json.dumps(config, ensure_ascii=False, indent=2)};
{script}</script></body></html>
'''
    # Sandbox readers bound individual lines: keep the complete recipe inspectable.
    markup, scripts = html.split('<script>', 1)
    html = markup.replace('><', '>\n<') + '<script>' + scripts
    assert max(len(line.encode('utf-8')) for line in html.splitlines()) <= 500
    (ROOT / (key + '.html')).write_text(html)
    queries = []
    for binding_id, dimensions in page['bindings'].items():
        fields = [{'id': d, 'sourceField': d, 'label': d, 'logicalType': 'string', 'role': 'dimension', 'nullable': False} for d in dimensions]
        fields += [{'id': m, 'sourceField': m, 'label': m, 'logicalType': 'decimal' if m in ['Sales', 'Profit', 'ReturnedSales'] else 'int64',
                    'role': 'measure', 'nullable': m in ['Sales', 'Profit', 'ReturnedSales']} for m in measures]
        queries.append({
            'id': binding_id, 'providerId': 'data-xpert.ontology', 'operation': 'action', 'contractVersion': 1,
            'payload': {'resourceId': '<discovered-resource-id>', 'actionTypeCode': 'sql.query_cube_slice',
                        'target': {'entityTypeCode': 'semantic_cube', 'entityRef': '<published-model-id>::SuperstoreOrders'},
                        'params': {'dimensions': dimensions, 'measures': measures,
                                   'filters': [{'field': d, 'op': 'contains', 'value': ''} for d in ['OrderYear', 'Region', 'Category']], 'limit': 100},
                        'parameterPaths': {c['controlId']: ['filters', str(i), 'value'] for i, c in enumerate(CONTROLS)}},
            'parameters': [{'name': c['controlId'], 'controlId': c['controlId'], 'type': 'string', 'required': True,
                            'defaultValue': '', 'allowedValues': c['allowedValues']} for c in CONTROLS],
            'output': {'datasetId': binding_id, 'fields': fields, 'grain': dimensions},
        })
    (ROOT / (key + '.queries.json')).write_text(json.dumps({'controls': CONTROLS, 'bindings': queries}, ensure_ascii=False, indent=2)+'\n')
print('Generated three HTML recipes and query plans (no embedded data).')
