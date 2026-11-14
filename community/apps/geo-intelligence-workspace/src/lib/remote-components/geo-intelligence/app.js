;(function () {
  const h = React.createElement
  const { request, action } = window.GeoBridge
  const RunCard = window.GeoRunCard
  const requestKey = window.GeoRequestKey
  function App() {
    const [query, setQuery] = React.useState('在本市选择体检机构时，应该关注哪些公开信息？')
    const [brand, setBrand] = React.useState('星河示例医院')
    const [prompts, setPrompts] = React.useState([])
    const [runs, setRuns] = React.useState([])
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')

    async function load() {
      try {
        const reply = await request('requestData', { query: {} })
        const data = reply.data || reply.result || reply.payload || {}
        setRuns(Array.isArray(data.items) ? data.items : [])
        setPrompts(Array.isArray(data.meta?.prompts) ? data.meta.prompts : [])
      } catch (e) { setError(String(e.message || e)) }
    }
    React.useEffect(() => {
      window.__geoReady = load
      if (window.GeoBridge.ready()) load()
      return () => { delete window.__geoReady }
    }, [])

    async function monitor(event) {
      event.preventDefault()
      setBusy(true)
      setError('')
      try {
        await action('monitor', { query, brand, runId: requestKey(query, brand) })
        window.GeoClearRequest()
        await load()
      } catch (e) { setError(String(e.message || e)) }
      finally { setBusy(false) }
    }

    return h('main', { className: 'geo-root' },
      h('header', null, h('div', { className: 'eyebrow' }, 'GEO INTELLIGENCE / HOSPITAL DEMO'), h('h1', null, 'GEO 智能监测工作台'), h('p', null, '用原始问题观察 DeepSeek 回答，再审核有证据支持的内容优化建议。')),
      h(window.GeoDashboard, { runs }),
      h('details', null, h('summary', null, 'Prompt 库'), prompts.map(item => h('button', { key: item.id, onClick: () => { setQuery(item.query); setBrand(item.brand) } }, item.query))),
      h('form', { onSubmit: monitor },
        h('label', null, '监测品牌', h('input', { value: brand, onChange: e => setBrand(e.target.value), maxLength: 100, required: true })),
        h('label', null, '监测问题', h('textarea', { value: query, onChange: e => setQuery(e.target.value), maxLength: 1000, rows: 3, required: true })),
        h('button', { disabled: busy, type: 'submit' }, busy ? '监测中…' : '运行监测'), h('button', { type: 'button', disabled: busy, onClick: async () => { try { await action('save_prompt', { query, brand }); await load() } catch (e) { setError(e.message) } } }, '保存到 Prompt 库')),
      error && h('div', { role: 'alert', className: 'error' }, error),
      h('section', null, h('div', { className: 'section-title' }, h('h2', null, '监测记录'), h('button', { type: 'button', onClick: load }, '刷新')),
        runs.length ? runs.map(run => h(RunCard, { key: run.run_id, run, refresh: load })) : h('p', { className: 'empty' }, '暂无监测记录。')))
  }

  const style = document.createElement('style')
  style.textContent = `
    *{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#152238;font:14px/1.6 system-ui,sans-serif}
    .geo-root{max-width:1100px;margin:auto;padding:32px}.eyebrow{color:#2563eb;font-size:11px;font-weight:700;letter-spacing:.12em}
    h1{margin:7px 0;font-size:28px}h2{font-size:18px;margin:0}header p{color:#64748b}
    form,article{background:white;border:1px solid #e2e8f0;border-radius:14px;padding:20px;margin:18px 0;box-shadow:0 2px 12px #0f172a08}
    label{display:block;font-weight:600;margin-bottom:14px}input,textarea{display:block;width:100%;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit;margin-top:6px}
    button{border:0;border-radius:8px;background:#2563eb;color:white;padding:9px 15px;font:inherit;cursor:pointer}button:disabled{opacity:.6}
    .section-title,.row{display:flex;justify-content:space-between;gap:18px;align-items:center}.section-title button{background:#e8efff;color:#1d4ed8}
    .pill{background:#ecfdf5;color:#047857;border-radius:100px;padding:2px 9px;white-space:nowrap}.pill.danger{background:#fef2f2;color:#b91c1c}
    article p{color:#475569}.suggestion{border-left:3px solid #60a5fa;padding-left:12px}.empty{padding:30px;color:#64748b}
    .actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.actions button{background:#eef2ff;color:#1d4ed8}details{margin:12px 0}summary{cursor:pointer;color:#1d4ed8}.version{border-top:1px solid #e2e8f0;margin-top:16px;padding-top:16px}
    pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8fafc;padding:14px;border-radius:8px}.error{color:#b91c1c}`
  document.head.appendChild(style)
  ReactDOM.render(h(App), document.getElementById('root'))
  window.GeoBridge.announce()
})()
