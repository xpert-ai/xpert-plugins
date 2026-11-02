// Extend the shared chart primitives; fields and labels remain explicit inputs.
const ProfitAtlasCharts = (() => {
  const token = name => getComputedStyle(document.body).getPropertyValue('--' + name).trim();
  function horizontal(chart, rows, options) {
    TrendWorkspaceCharts.horizontal(chart, rows, options);
    chart.setOption({grid: {left: 82, right: 78},
      series: [{id: options.measure, barMaxWidth: 16, label: {fontSize: 12}}],
      xAxis: {splitLine: {show: false}},
      yAxis: {axisLabel: {fontSize: 12}}});
  }
  function scatter(chart, rows, options) {
    TrendWorkspaceCharts.scatter(chart, rows, options);
    const narrow = chart.getWidth() < 600;
    const maximum = Math.max(0, ...rows.map(row => Number(row[options.x])));
    chart.setOption({grid: {left: 46, right: 32, top: 30, bottom: 46},
      xAxis: {splitLine: {lineStyle: {type: 'dashed'}}},
      yAxis: {splitLine: {lineStyle: {type: 'dashed'}}},
      series: [{id: 'scatter', symbolSize: 10, labelLayout: {hideOverlap: true},
        data: rows.map(row => {
          const negative = Number(row[options.y]) < 0;
          return {value: [Number(row[options.x]), Number(row[options.y])], name: row[options.dimension],
            itemStyle: {color: token(negative ? 'red' : 'teal'), opacity: 1},
            label: {show: negative || (!narrow && (Number(row[options.x]) >= maximum * .15 || Number(row[options.y]) >= 12000)), formatter: String(row[options.dimension]),
              position: Number(row[options.x]) > maximum * .9 ? 'left' : 'right',
              color: token(negative ? 'red' : 'ink'), fontSize: 12}};
        })}]
    });
  }
  return {line: TrendWorkspaceCharts.line, horizontal, scatter};
})();
