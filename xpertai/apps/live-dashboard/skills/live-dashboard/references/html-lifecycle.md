# HTML / ECharts lifecycle example

Use this lifecycle for one or several declared Bindings. It is a starting pattern,
not a fixed page design. Replace the configuration with the exact IDs and field
names from preview receipts, then implement the requested layout and renderers.
Do not change the data source, add mock business rows, or copy the placeholder IDs.

For one source, prefer one complete Dataset feeding the KPI, trend and detail table.
For several sources, use a distinct binding.id / output.datasetId for each source;
include every previewId in the save. The example assumes all Bindings share one
optional string dimension parameter named `region`, defaulting to null. Adapt this
explicit contract to the discovered parameters; never infer it from the filename.

```html
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin: 0; padding: 24px; font-family: system-ui; }
  header { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .chart { width: 100%; height: 320px; }
  td, th { padding: 8px; text-align: left; }
</style>
</head>
<body>
<header><h1>Replace with the requested title</h1>
  <label>区域 <select id="regionFilter" data-dashboard-control="region"></select></label>
  <button id="refresh" type="button">刷新</button>
</header>
<main id="panels"></main>
<script>
(async () => {
  const live = window.xpertLiveArtifact;
  const config = [
    { id: 'REPLACE_BINDING_ID', label: 'Replace source label',
      region: 'region', category: 'month', measure: 'net_sales', unit: 'CNY' }
  ];
  const select = document.getElementById('regionFilter');
  const controls = { region: null };
  const known = new Set();
  const panels = new Map();
  function addOption(value, label) {
    const key = JSON.stringify(value);
    if (known.has(key)) return;
    known.add(key);
    select.add(new Option(label, key));
  }
  addOption(null, '全部');
  select.value = JSON.stringify(controls.region);
  for (const entry of config) {
    const section = document.createElement('section');
    // Only static markup belongs in innerHTML. Received values use textContent.
    section.innerHTML = '<h2></h2><p role="status"></p><div class="chart"></div><table><thead></thead><tbody></tbody></table>';
    section.querySelector('h2').textContent = entry.label;
    document.getElementById('panels').append(section);
    const chartElement = section.querySelector('.chart');
    const chart = window.echarts.init(chartElement, null, { renderer: 'svg' });
    new ResizeObserver(() => chart.resize()).observe(chartElement);
    const state = { status: section.querySelector('[role=status]'), chart, section };
    panels.set(entry.id, state);
    live.subscribe(entry.id, dataset => {
      for (const row of dataset.rows) {
        const value = row[entry.region];
        if (typeof value === 'string') addOption(value, value);
      }
      // Preserve the full option set through filtered results and refreshes.
      select.value = JSON.stringify(controls.region);
      render(entry, state, dataset);
    });
  }
  function showError(id, error) {
    panels.get(id).status.textContent = `读取失败：${error.message || String(error)}`;
  }
  async function queryAll(refresh = false) {
    await Promise.all(config.map(async entry => {
      panels.get(entry.id).status.textContent = '加载中…';
      try {
        if (refresh) await live.refresh(entry.id);
        else await live.query(entry.id, { ...controls });
      } catch (error) { showError(entry.id, error); }
    }));
  }
  select.addEventListener('change', () => {
    controls.region = JSON.parse(select.value);
    void queryAll();
  });
  document.getElementById('refresh').addEventListener('click', () => void queryAll(true));
  await live.ready();
  await queryAll();

  function render(entry, state, dataset) {
    // REPLACE this body with the requested KPI, complete ECharts option and table.
    // This explicit failure prevents saving an unfinished example as a dashboard.
    throw new Error('Implement render(entry, state, dataset) using verified fields');
  }
})().catch(error => {
  const status = document.createElement('p');
  status.textContent = `初始化失败：${error.message || String(error)}`;
  document.body.append(status);
  console.error(error);
});
</script>
</body>
</html>
```

Implement `render` before saving:

- Update KPI, ECharts and details together inside the subscription. Never render only
  in `query().then(...)`: toolbar refresh also arrives through the subscription.
- Use complete rows only for totals. Check `completeness.truncated` and scope; show
  a partial-result warning instead of presenting a subset as a full total.
- Aggregate repeated categories and preserve every grain dimension. Use exact decimal
  arithmetic for money (for a verified two-decimal currency, integer minor units);
  convert to Number only when safe for plotting. Do not sum an already aggregated total again.
- Use `chart.setOption(completeOption, {notMerge:true})` including axes and the complete
  series list with type/name/data. Derive active series and legend dimensions from
  each received Dataset, including filtered results; do not keep excluded groups as
  zero-valued series. Clear old rows/series when the result becomes empty.
- Set the per-panel success time only when its dataset arrives. Display errors for
  each panel and never label stale data as refreshed.
- Keep the typed selection and listener above; do not also attach `bindSelect` or
  parse a differently encoded value. Every affected Binding must receive the filter.

Run `dashboard_test_filter` for each relevant preview, then save with all previewIds,
matching controls and `libraries:["echarts"]`. A preflight error saves nothing;
repair the same file and retry the domain save. Do not start over with a new Artifact.
