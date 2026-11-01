// Generic ECharts recipes: business fields/labels are explicit arguments, never inferred from names.
const TrendWorkspaceCharts = (() => {
  function tokens() {
    const style = getComputedStyle(document.body);
    return Object.fromEntries(['ink', 'muted', 'line', 'blue', 'teal', 'red'].map(key => [key, style.getPropertyValue('--' + key).trim()]));
  }
  const compact = value => Math.abs(value) >= 1000000 ? value / 1000000 + 'm' : Math.abs(value) >= 1000 ? value / 1000 + 'k' : String(value);
  const amount = value => new Intl.NumberFormat('en-US', {maximumFractionDigits: 2}).format(value);
  function axis() {
    const t = tokens();
    return {axisLabel: {color: t.muted, fontSize: 11}, nameTextStyle: {color: t.muted}, axisTick: {show: false},
      axisLine: {lineStyle: {color: t.line}}, splitLine: {lineStyle: {color: t.line}}};
  }
  function line(chart, rows, {dimension, measure, label, color = 'blue'}) {
    const t = tokens(), a = axis();
    chart.setOption({animation: false, aria: {enabled: true}, textStyle: {fontFamily: 'system-ui, sans-serif'},
      grid: {left: 48, right: 34, top: 14, bottom: 28}, color: [t[color]], tooltip: {trigger: 'axis', confine: true},
      xAxis: {...a, type: 'category', boundaryGap: false, data: rows.map(row => row[dimension]), splitLine: {show: false},
        axisLabel: {...a.axisLabel, hideOverlap: true, showMaxLabel: true}},
      yAxis: {...a, type: 'value', axisLabel: {...a.axisLabel, formatter: compact}},
      series: [{id: measure, name: label, type: 'line', smooth: false, showSymbol: false, lineStyle: {width: 2},
        ...(color === 'blue' ? {areaStyle: {opacity: .045}} : {}), data: rows.map(row => Number(row[measure])),
        ...(rows.some(row => Number(row[measure]) < 0) ? {markLine: {silent: true, symbol: 'none', label: {show: false},
          lineStyle: {color: t.muted, type: 'dashed', width: 1}, data: [{yAxis: 0}]}} : {})}]
    }, {notMerge: true});
  }
  function horizontal(chart, rows, {dimension, measure, label, color = 'blue', decimals = 2}) {
    const t = tokens(), a = axis();
    const narrow = chart.getWidth() < 450;
    chart.setOption({animation: false, aria: {enabled: true}, textStyle: {fontFamily: 'system-ui, sans-serif'},
      grid: {left: narrow ? 78 : 96, right: narrow ? 70 : 92, top: 8, bottom: 26},
      tooltip: {trigger: 'axis', confine: true, axisPointer: {type: 'shadow'}},
      xAxis: {...a, type: 'value', splitNumber: 4, axisLabel: {...a.axisLabel, formatter: compact}},
      yAxis: {...a, type: 'category', inverse: true, data: rows.map(row => row[dimension]), splitLine: {show: false},
        axisLine: {show: false}, axisLabel: {...a.axisLabel, width: narrow ? 72 : 90, overflow: 'truncate'}},
      series: [{id: measure, name: label, type: 'bar', barMaxWidth: 20,
        label: {show: true, position: 'right', color: t.ink, fontSize: 11,
          formatter: item => new Intl.NumberFormat('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}).format(item.value)},
        data: rows.map(row => ({value: Number(row[measure]), itemStyle: {color: Number(row[measure]) < 0 ? t.red : t[color]},
          ...(Number(row[measure]) < 0 ? {label: {position: 'right', color: t.red}} : {})}))}]
    }, {notMerge: true});
  }
  function scatter(chart, rows, {dimension, x, y, xLabel, yLabel}) {
    const t = tokens(), a = axis();
    chart.setOption({animation: false, aria: {enabled: true}, grid: {left: 54, right: 24, top: 28, bottom: 48},
      tooltip: {trigger: 'item', confine: true, formatter: item => {
        const row = rows[item.dataIndex];
        return String(row[dimension]).replace(/[<>&"']/g, '') + '<br>' + xLabel + ': ' + amount(Number(row[x])) + '<br>' + yLabel + ': ' + amount(Number(row[y]));
      }},
      xAxis: {...a, name: xLabel, nameLocation: 'middle', nameGap: 30, type: 'value', axisLabel: {...a.axisLabel, formatter: compact}},
      yAxis: {...a, name: yLabel, type: 'value', axisLabel: {...a.axisLabel, formatter: compact}},
      series: [{id: 'scatter', name: dimension, type: 'scatter', symbolSize: 11,
        data: rows.map(row => ({value: [Number(row[x]), Number(row[y])], name: row[dimension],
          itemStyle: {color: Number(row[y]) < 0 ? t.red : t.teal, opacity: .8},
          label: {show: Number(row[y]) < 0, formatter: String(row[dimension]), position: 'bottom', color: t.red, fontSize: 11}})),
        markLine: {silent: true, symbol: 'none', label: {show: false}, lineStyle: {color: t.muted, type: 'dashed'}, data: [{yAxis: 0}]}}]
    }, {notMerge: true});
  }
  return {line, horizontal, scatter};
})();
