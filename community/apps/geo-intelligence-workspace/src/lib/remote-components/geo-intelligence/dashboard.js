;(function () {
  const h = React.createElement
  let memoryPending = null
  window.GeoClearRequest = () => {
    memoryPending = null
    try { sessionStorage.removeItem('geo-pending-monitor') } catch {}
  }
  window.GeoRequestKey = (query, brand) => {
    const fingerprint = JSON.stringify([query, brand])
    try {
      const prior = JSON.parse(sessionStorage.getItem('geo-pending-monitor') || 'null')
      if (prior?.fingerprint === fingerprint) return prior.id
    } catch {}
    if (memoryPending?.fingerprint === fingerprint) return memoryPending.id
    const id = crypto.randomUUID()
    memoryPending = { fingerprint, id }
    try { sessionStorage.setItem('geo-pending-monitor', JSON.stringify(memoryPending)) } catch {}
    return id
  }
  window.GeoDashboard = function Dashboard({ runs }) {
    const completed = runs.filter(run => run.status !== 'failed')
    const mentioned = completed.filter(run => run.metrics?.brand_mentioned).length
    const rate = completed.length ? `${(100 * mentioned / completed.length).toFixed(1)}%` : '—'
    const brands = new Set(completed.map(run => run.brand))
    return h('section', { 'aria-label': '监测概览' },
      h('div', { className: 'actions' },
        h('span', { className: 'pill' }, `当前记录 ${runs.length}`),
        h('span', { className: 'pill' }, `完成 ${completed.length}`),
        h('span', { className: 'pill danger' }, `失败 ${runs.length - completed.length}`),
        h('span', { className: 'pill' }, `品牌提及率 ${brands.size > 1 ? '请按品牌查看记录' : rate}`)),
      h('p', null, '范围：最近 100 条 API 监测；失败不计入提及率。标准 DeepSeek API 不提供可验证引用元数据，引用率暂不可用。复测变化不代表优化内容已被模型收录。'))
  }
})()
