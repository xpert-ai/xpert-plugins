;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS = {
    draft: '待生成',
    ready: '待确认',
    needs_info: '待补充',
    failed: '处理失败',
    confirmed: '已确认',
    returned: '已退回'
  }
  const CATEGORY = { logistics: '物流', product: '商品', refund: '退款', service: '服务', other: '其他' }
  const URGENCY = { low: '低', normal: '普通', high: '高' }
  const SAMPLES = {
    normal: '订单 SO-10086 的包裹物流延误三天，联系人李敏 13800001111，希望今天发出，或者赔偿运费。',
    short: '你们太差了',
    escalate: '订单 SO-20002，联系人王磊 13900002222。这已经是第三次投诉，我要向监管部门反映，并要求高额赔偿。'
  }

  injectStyles()

  function post(type, body) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type }, body || {}), '*')
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}))
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!message || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return
    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__complaintSetContext && window.__complaintSetContext(message)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      window.__complaintReload && window.__complaintReload()
      return
    }
    const item = message.requestId && pending.get(message.requestId)
    if (!item) return
    pending.delete(message.requestId)
    if (message.type === 'error') item.reject(new Error(message.message || '请求失败'))
    else item.resolve(message)
  })

  function unwrap(response) {
    if (!response) return {}
    return response.data || response.result || response.payload || response
  }

  function App() {
    const [data, setData] = React.useState(null)
    const [selectedId, setSelectedId] = React.useState('')
    const [rawText, setRawText] = React.useState('')
    const [form, setForm] = React.useState({})
    const [notice, setNotice] = React.useState('')
    const [error, setError] = React.useState('')
    const [busy, setBusy] = React.useState(false)

    const load = React.useCallback(async (caseId) => {
      const response = unwrap(await request('requestData', { query: { page: 1, pageSize: 20, parameters: caseId ? { caseId } : {} } }))
      const payload = response.data || response
      setData(payload)
      const selected = payload.selected
      if (selected) {
        setSelectedId(selected.id)
        setRawText(selected.rawText || '')
        setForm(selected)
      } else if (!caseId) {
        setSelectedId('')
        setForm({})
      }
    }, [])

    React.useEffect(() => {
      window.__complaintSetContext = () => load()
      window.__complaintReload = () => load(selectedId)
      post('ready')
      return () => {
        delete window.__complaintSetContext
        delete window.__complaintReload
      }
    }, [load, selectedId])

    async function run(actionKey, input) {
      setBusy(true)
      setError('')
      setNotice('')
      try {
        const response = unwrap(await request('executeAction', { actionKey, targetId: selectedId || undefined, input: input || {} }))
        const result = response.data || response
        if (response.success === false || result.success === false) {
          const message = (result.message && (result.message.zh_Hans || result.message.en_US || result.message)) || '操作失败'
          setError(typeof message === 'string' ? message : '操作失败')
          return
        }
        const commandKey = result.commandKey || (result.data && result.data.commandKey)
        const payload = result.payload || (result.data && result.data.payload)
        const nextId = (result.data && result.data.caseId) || result.caseId || selectedId
        if (commandKey) await request('invokeClientCommand', { commandKey, payload })
        setNotice('操作已提交')
        await load(nextId)
      } catch (caught) {
        setError(caught.message || '操作失败')
      } finally {
        setBusy(false)
      }
    }

    const items = (data && data.items) || []
    const selected = form || {}
    return h('div', { className: 'desk' },
      h('aside', null,
        h('h1', null, '投诉受理台'),
        items.length === 0
          ? h('p', { className: 'empty' }, '还没有受理记录。先在右侧粘贴一段客户原话。')
          : items.map((item) => h('button', {
              key: item.id,
              className: item.id === selectedId ? 'case active' : 'case',
              onClick: () => load(item.id)
            }, h('strong', null, item.caseNo || '未编号'), h('span', null, STATUS[item.status] || item.status))),
        h('div', { className: 'samples' },
          h('p', null, '样例'),
          h('button', { onClick: () => setRawText(SAMPLES.normal) }, '物流延误'),
          h('button', { onClick: () => setRawText(SAMPLES.short) }, '信息不足'),
          h('button', { onClick: () => setRawText(SAMPLES.escalate) }, '建议升级'))
      ),
      h('main', null,
        notice ? h('p', { className: 'ok' }, notice) : null,
        error ? h('p', { className: 'bad' }, error) : null,
        h('label', null, '客户原话'),
        h('textarea', { value: rawText, onChange: (event) => setRawText(event.target.value) }),
        h('div', { className: 'actions' },
          h('button', { disabled: busy, onClick: () => run('prepare_chat_message', { rawText, caseId: selectedId }) }, '交给助手生成草稿'),
          h('button', { disabled: busy || (!selectedId && rawText.trim().length < 8), onClick: () => run('simulate_model_failure', { rawText, caseId: selectedId }) }, '模拟模型失败')),
        !selectedId
          ? h('p', { className: 'empty' }, '生成草稿后，这里会显示 AI 结果和确认操作。')
          : h('section', null,
              h('p', null, '状态：', STATUS[selected.status] || selected.status || '未知', selected.confirmedCount ? ` · 已确认 ${selected.confirmedCount} 次` : ''),
              selected.failureReason ? h('p', { className: 'bad' }, selected.failureReason) : null,
              (selected.validationErrors || []).length ? h('p', { className: 'bad' }, selected.validationErrors.join('；')) : null,
              (selected.missingFields || []).length ? h('p', null, '缺少：', selected.missingFields.join('、')) : null,
              field('问题类型', 'category', selected, setForm, Object.entries(CATEGORY)),
              field('紧急度', 'urgency', selected, setForm, Object.entries(URGENCY)),
              textField('订单号', 'orderNo', selected, setForm),
              textField('联系方式', 'contact', selected, setForm),
              textField('客户诉求', 'customerDemand', selected, setForm, true),
              textField('建议回复', 'suggestedReply', selected, setForm, true),
              h('label', { className: 'check' },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(selected.escalationSuggested),
                  onChange: (event) => setForm(Object.assign({}, selected, { escalationSuggested: event.target.checked }))
                }),
                '建议升级'),
              textField('升级理由', 'escalationReason', selected, setForm),
              h('div', { className: 'actions' },
                h('button', { disabled: busy, onClick: () => run('update_case', Object.assign({ caseId: selectedId, rawText }, selected)) }, '保存修改'),
                h('button', { disabled: busy, onClick: () => run('confirm_intake', Object.assign({ caseId: selectedId, rawText }, selected)) }, '确认受理'),
                h('button', { disabled: busy, onClick: () => run('return_for_supplement', { caseId: selectedId, reason: '请补充订单号或联系方式后再受理' }) }, '退回补充')))
    )
  }

  function field(label, key, selected, setForm, options) {
    return h('label', null, label,
      h('select', {
        value: selected[key] || '',
        onChange: (event) => setForm(Object.assign({}, selected, { [key]: event.target.value }))
      }, h('option', { value: '' }, '请选择'), options.map(([value, name]) => h('option', { key: value, value }, name))))
  }

  function textField(label, key, selected, setForm, multiline) {
    const props = {
      value: selected[key] || '',
      onChange: (event) => setForm(Object.assign({}, selected, { [key]: event.target.value }))
    }
    return h('label', null, label, multiline ? h('textarea', props) : h('input', props))
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
      body { margin: 0; font: 14px/1.5 "Segoe UI", sans-serif; color: #1f2937; background: #f8fafc; }
      .desk { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
      aside, main { padding: 16px; }
      aside { background: #fff7ed; border-right: 1px solid #fed7aa; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      .case, button { font: inherit; }
      .case { display: block; width: 100%; text-align: left; margin: 0 0 8px; padding: 8px; border: 1px solid #fdba74; background: white; border-radius: 8px; }
      .case.active { border-color: #c2410c; background: #ffedd5; }
      .case span { display: block; color: #9a3412; }
      .samples button, .actions button { margin: 0 8px 8px 0; padding: 8px 12px; border-radius: 8px; border: 1px solid #c2410c; background: white; }
      label { display: block; margin: 10px 0; }
      input, select, textarea { width: 100%; box-sizing: border-box; margin-top: 4px; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; }
      textarea { min-height: 88px; }
      .empty { color: #6b7280; }
      .ok { color: #166534; }
      .bad { color: #b91c1c; }
      .check { display: flex; gap: 8px; align-items: center; }
      .check input { width: auto; }
    `
    document.head.appendChild(style)
  }

  ReactDOM.createRoot(document.getElementById('root')).render(h(App))
})()
