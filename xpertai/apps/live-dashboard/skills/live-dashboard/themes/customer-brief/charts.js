// Explicit palette options distinguish ranked customer segments from return counts.
const CustomerBriefCharts = (() => {
  function horizontal(chart, rows, options) {
    TrendWorkspaceCharts.horizontal(chart, rows, options);
    const token = name => getComputedStyle(document.body).getPropertyValue('--' + name).trim();
    const narrow = chart.getWidth() < 420;
    const colors = options.palette || ['blue'];
    chart.setOption({grid: {left: narrow ? 80 : 104, right: options.decimals === 0 ? 40 : 112, top: 12, bottom: 28},
      xAxis: {axisLabel: {fontSize: 12}}, yAxis: {axisLabel: {fontSize: narrow ? 12 : 15}},
      series: [{id: options.measure, barMaxWidth: 28,
        label: {fontSize: narrow ? 12 : 15},
        data: rows.map((row, index) => ({value: Number(row[options.measure]),
          itemStyle: {color: token(Number(row[options.measure]) < 0 ? 'red' : colors[index % colors.length])}}))}]
    });
  }
  return {...TrendWorkspaceCharts, horizontal};
})();
