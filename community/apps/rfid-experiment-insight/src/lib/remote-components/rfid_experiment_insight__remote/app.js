;(function () {
  'use strict'
  const h = React.createElement
  const protocol = window.RFID_REMOTE_PROTOCOL
  const pending = new Map()
  let instanceId = null, hostOrigin = '*', sequence = 0
  let onInit = () => {}, onHostEvent = () => {}
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const messageText = (value) => typeof value === 'string' ? value : value?.zh_Hans || value?.en_US || '操作失败，请刷新后重试。'

  function post(type, body = {}, transfer = []) {
    window.parent.postMessage({ channel: protocol.channel, protocolVersion: protocol.protocolVersion, instanceId, type, ...body }, hostOrigin, transfer)
  }
  function request(type, body) {
    if (!instanceId) return Promise.reject(new Error('工作台尚未连接宿主，请稍候或刷新。'))
    const requestId = String(++sequence)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(new Error('请求超时。请刷新确认当前状态后重试。'))
      }, 30000)
      pending.set(requestId, { expectedType: protocol.responses[type], resolve, reject, timer })
      try { post(type, { requestId, ...body }) }
      catch (error) { clearTimeout(timer); pending.delete(requestId); reject(error) }
    })
  }
  function disposeRequests() {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('宿主连接已改变，请刷新。')) }
    pending.clear()
  }
  function receive(event) {
    if (event.source !== window.parent) return
    const message = event.data
    if (!object(message) || message.channel !== protocol.channel || message.protocolVersion !== protocol.protocolVersion) return
    if (message.type === 'init' && typeof message.instanceId === 'string' && message.instanceId) {
      const replaced = instanceId !== null && instanceId !== message.instanceId
      if (replaced) disposeRequests()
      instanceId = message.instanceId
      hostOrigin = event.origin && event.origin !== 'null' ? event.origin : '*'
      if (window.XpertRemoteUI) window.XpertRemoteUI.applyTheme(message.theme)
      onInit(message, replaced)
      return
    }
    if (!instanceId || message.instanceId !== instanceId || (hostOrigin !== '*' && event.origin !== hostOrigin)) return
    if (message.type === 'hostEvent') { onHostEvent(message.event); return }
    const item = pending.get(message.requestId)
    if (!item) return
    clearTimeout(item.timer)
    pending.delete(message.requestId)
    if (message.type === 'error') item.reject(new Error(messageText(message.message)))
    else if (message.type !== item.expectedType) item.reject(new Error('宿主返回了不匹配的消息类型，请刷新。'))
    else if (message.type === 'data') item.resolve(message.data)
    else item.resolve(message.result)
  }
  async function action(actionKey, analysisId, input = {}) {
    const result = await request('executeAction', { actionKey, targetId: analysisId, input: { analysisId, ...input } })
    if (!object(result) || result.success !== true) throw new Error(messageText(result?.message))
    return result.data
  }

  const statusLabels = { DRAFT: 'Ready · CSV 已上传', ANALYZING: 'ANALYZING · 分析中', COMPLETED: 'COMPLETED · 待复核', FAILED: 'FAILED · 可重试' }
  const percent = (value) => typeof value === 'number' ? `${(value * 100).toFixed(2)}%` : '—'
  const decimal = (value) => typeof value === 'number' ? new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value) : '—'
  const date = (value) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : ''

  function Status({ record }) {
    return h('span', { className: `rfid-status state-${record.status}`, 'data-status': record.status }, record.confirmedAt ? 'COMPLETED · 已确认' : statusLabels[record.status] || record.status)
  }
  function Metric({ label, value, note }) {
    return h('div', { className: 'rfid-metric' }, h('dt', null, label), h('dd', null, value), note && h('small', null, note))
  }
  function Condition({ label, value }) {
    return h('div', { className: 'rfid-condition' }, h('h4', null, label),
      h('strong', null, `${decimal(value.distance_m)} m · ${decimal(value.angle_deg)}° · ${value.environment}`),
      h('p', null, `平均准确率 ${percent(value.average_accuracy)} · ${value.record_count} 次实验`))
  }
  function Statistics({ statistics }) {
    if (!statistics) return null
    return h('section', { className: 'rfid-panel', 'aria-labelledby': 'statistics-title' },
      h('div', { className: 'rfid-section-head' }, h('h3', { id: 'statistics-title' }, '确定性统计'), h('span', null, '实验结果 · 后端计算')),
      h('dl', { className: 'rfid-metrics' },
        h(Metric, { label: 'Record Count', value: statistics.record_count, note: '已完成的 experiment runs' }),
        h(Metric, { label: 'Average Accuracy', value: percent(statistics.average_accuracy), note: '所有实验记录的平均准确率' }),
        h(Metric, { label: 'Accuracy Drop', value: `${(statistics.accuracy_drop_vs_best * 100).toFixed(2)} 个百分点`, note: '最佳 − 最差条件均值' })),
      h('div', { className: 'rfid-conditions' }, h(Condition, { label: 'Best Condition', value: statistics.best_condition }), h(Condition, { label: 'Worst Condition', value: statistics.worst_condition })),
      h('dl', { className: 'rfid-metrics signals' },
        h(Metric, { label: 'RSSI Std Change', value: decimal(statistics.rssi_std_change), note: '最差 − 最佳条件均值' }),
        h(Metric, { label: 'Phase Dispersion Change', value: decimal(statistics.phase_dispersion_change), note: '最差 − 最佳条件均值' })),
      h('p', { className: 'rfid-footnote' }, '按距离、角度和环境分组。RSSI / Phase 指标来自上游实验流程；此处展示组间变化，不重算原始信号。'))
  }
  function Interpretation({ summary }) {
    return h('section', { className: 'rfid-panel', 'aria-labelledby': 'interpretation-title' },
      h('div', { className: 'rfid-section-head' }, h('h3', { id: 'interpretation-title' }, 'AI 实验解释'), h('span', null, '请复核后确认')),
      [['overallTrend', 'Overall Trend'], ['mostDegradedCondition', 'Most Degraded Condition'], ['signalQualityObservation', 'Signal Quality Observation'], ['suggestedFollowUp', 'Suggested Follow-up']].map(([key, label]) =>
        h('section', { className: 'rfid-insight', key }, h('h4', null, label), h('p', null, summary[key]))))
  }

  function App() {
    const [connected, setConnected] = React.useState(false)
    const [data, setData] = React.useState({ items: [] })
    const [selectedId, setSelectedId] = React.useState(null)
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState('')
    const [notice, setNotice] = React.useState('')
    const [file, setFile] = React.useState(null)
    const [name, setName] = React.useState('')
    const [reviewed, setReviewed] = React.useState(false)
    const selectedRef = React.useRef(null), dataRef = React.useRef({ items: [] })
    const readyRef = React.useRef(false), busyRef = React.useRef(false), loadingRef = React.useRef(false)
    const uploadRef = React.useRef(null), loadSequence = React.useRef(0), mounted = React.useRef(true)
    const fileInput = React.useRef(null)

    function updateData(value) {
      dataRef.current = value; setData(value)
      if (value.item?.status === 'COMPLETED' || value.item?.status === 'FAILED') {
        setNotice((current) => current === '请求已发送到 Assistant，正在等待解释结果。' ? '' : current)
      }
    }
    async function reload(id = selectedRef.current, options = {}) {
      if (!readyRef.current) return
      const sequence = ++loadSequence.current
      loadingRef.current = true
      if (!options.silent) setLoading(true)
      try {
        const next = await request('requestData', { query: { parameters: id ? { analysisId: id } : {} } })
        if (!mounted.current || sequence !== loadSequence.current) return
        if (!object(next) || !Array.isArray(next.items)) throw new Error('无法读取分析记录，请刷新。')
        if (options.autoSelect && !id && next.items.length) {
          const firstId = next.items[0].id
          selectedRef.current = firstId; setSelectedId(firstId)
          return await reload(firstId)
        }
        // A host refresh must not replace a user's newer selection with an older response.
        if (id !== selectedRef.current) return
        updateData(next)
      } catch (cause) { if (mounted.current && sequence === loadSequence.current) setError(cause.message) }
      finally { if (mounted.current && sequence === loadSequence.current) { loadingRef.current = false; setLoading(false) } }
    }
    function select(id) {
      if (busyRef.current) return
      selectedRef.current = id; setSelectedId(id); setReviewed(false); setError(''); setNotice('')
      updateData({ ...dataRef.current, item: undefined })
      void reload(id)
    }
    async function mutation(work) {
      if (busyRef.current || !readyRef.current) return
      busyRef.current = true; setBusy(true); setError(''); setNotice('')
      try { await work() }
      catch (cause) { if (mounted.current) setError(cause.message) }
      finally { busyRef.current = false; if (mounted.current) setBusy(false) }
    }
    function chooseFile(event) {
      const chosen = event.target.files?.[0]
      setError(''); setNotice('')
      if (!chosen) return
      if (!chosen.size || chosen.size > 1024 * 1024) {
        setError('请选择非空、大小不超过 1 MiB 的 CSV 文件。')
        event.target.value = ''; uploadRef.current = null; setFile(null); return
      }
      uploadRef.current = { file: chosen, requestId: crypto.randomUUID() }
      setFile(chosen); setName(chosen.name.replace(/\.csv$/i, ''))
    }
    function upload(event) {
      event.preventDefault()
      const upload = uploadRef.current
      if (!upload || !name.trim()) return
      void mutation(async () => {
        const buffer = await upload.file.arrayBuffer()
        const result = await request('executeFileAction', { actionKey: 'upload_csv',
          input: { requestId: upload.requestId, name: name.trim() },
          file: { name: upload.file.name, type: upload.file.type, size: upload.file.size, lastModified: upload.file.lastModified, buffer } })
        if (!object(result) || result.success !== true) throw new Error(messageText(result?.message))
        const id = result.data?.id
        if (typeof id !== 'string') throw new Error('上传响应缺少分析 ID，请刷新确认。')
        uploadRef.current = null; setFile(null); setName(''); setReviewed(false)
        selectedRef.current = id; setSelectedId(id)
        await reload(id)
        setNotice('CSV 已保存，确定性统计已生成。现在可以发起 Assistant 分析。')
      })
    }
    function analyze() {
      const id = selectedRef.current
      if (!id) return
      void mutation(async () => {
        let prepared
        try {
          prepared = await action('analyze_experiment', id)
          if (prepared?.command?.type !== 'assistant-message' || prepared.command.commandKey !== 'assistant.chat.send_message' || prepared.analysisId !== id || typeof prepared.attemptId !== 'string') {
            throw new Error('无法识别 Assistant 分析命令，请刷新确认。')
          }
          const receipt = await request('invokeClientCommand', { commandKey: prepared.command.commandKey, payload: prepared.command.payload })
          if (!object(receipt) || receipt.success !== true) throw new Error(messageText(receipt?.message || 'Assistant 未接受请求。请确认已从模板创建助手并配置模型。'))
          setNotice('请求已发送到 Assistant，正在等待解释结果。')
        } catch (cause) {
          if (prepared?.analysisId === id && typeof prepared.attemptId === 'string') {
            try { await action('report_dispatch_failure', id, { attemptId: prepared.attemptId }) }
            catch { throw new Error(`${cause.message} 失败状态暂未同步，请刷新；处理中记录会在超时后恢复为可重试。`) }
          }
          throw cause
        } finally { await reload(id) }
      })
    }
    function confirm() {
      const id = selectedRef.current
      if (!id || !reviewed) return
      void mutation(async () => {
        await action('save_analysis', id, { confirmed: true })
        await reload(id)
        setNotice('已确认并保存。刷新或重新进入后仍可恢复。')
      })
    }

    React.useEffect(() => {
      mounted.current = true
      const initTimer = setTimeout(() => { if (!readyRef.current) { setLoading(false); setError('尚未连接到 Xpert 宿主。请从 Assistant 工作台打开此页面。') } }, 15000)
      onInit = (message, replaced) => {
        clearTimeout(initTimer)
        const first = !readyRef.current || replaced
        readyRef.current = true; setConnected(true)
        if (first) {
          const initial = message.initialQuery?.parameters?.analysisId ?? message.initialQuery?.selectionId ?? null
          selectedRef.current = typeof initial === 'string' ? initial : null
          setSelectedId(selectedRef.current); setReviewed(false)
        }
        void reload(selectedRef.current, { autoSelect: first && !selectedRef.current, silent: !first })
      }
      onHostEvent = (event) => {
        if (event?.type === 'assistant.tool.completed' && ['analyze_experiment', 'save_analysis'].includes(event.toolName)) void reload(selectedRef.current, { silent: true })
      }
      window.addEventListener('message', receive)
      post('ready')
      const poll = setInterval(() => {
        if (!busyRef.current && !loadingRef.current && (dataRef.current.item?.status === 'ANALYZING' || dataRef.current.items.some((item) => item.status === 'ANALYZING'))) void reload(selectedRef.current, { silent: true })
      }, 3000)
      return () => { mounted.current = false; clearTimeout(initTimer); clearInterval(poll); window.removeEventListener('message', receive); disposeRequests() }
    }, [])
    React.useEffect(() => { if (connected) post('resize', { height: Math.max(document.body.scrollHeight, 700) }) }, [connected, data, error, selectedId, file])

    const record = data.item
    return h('div', { className: 'rfid-app' },
      h('header', { className: 'rfid-header' },
        h('div', { className: 'rfid-brand' }, h('span', { className: 'rfid-mark', 'aria-hidden': true }, '↗'), h('div', null, h('p', { className: 'rfid-eyebrow' }, 'RFID EXPERIMENT INSIGHT'), h('h1', null, '无线感知实验分析'))),
        h('button', { className: 'rfid-button', disabled: !connected || busy || loading, onClick: () => { setError(''); setNotice(''); void reload() } }, '↻ Refresh')),
      h('p', { className: 'rfid-intro' }, '从已完成的实验结果出发，查看可靠统计，复核 AI 解释。'),
      error && h('div', { role: 'alert', className: 'rfid-banner error' }, error),
      notice && h('div', { role: 'status', className: 'rfid-banner notice' }, notice),
      h('div', { className: 'rfid-layout' },
        h('aside', { className: 'rfid-history', 'aria-label': 'History' },
          h('div', { className: 'rfid-section-head' }, h('h2', null, 'History'), h('span', null, '历史分析')),
          h('button', { className: 'rfid-button new', disabled: busy || !connected, onClick: () => select(null) }, '+ 新建分析'),
          !data.items.length && h('p', { className: 'rfid-muted' }, loading ? '正在读取历史记录…' : '还没有分析记录。上传第一份实验结果 CSV。'),
          h('nav', { className: 'rfid-history-list', 'aria-label': '分析记录' }, data.items.map((item) =>
            h('button', { key: item.id, className: `rfid-history-item ${selectedId === item.id ? 'selected' : ''}`, 'aria-current': selectedId === item.id ? 'true' : undefined, disabled: busy, onClick: () => select(item.id) },
              h('strong', null, item.name), h(Status, { record: item }), h('small', null, date(item.createdAt))))),
          data.items.length >= 100 && h('p', { className: 'rfid-footnote' }, '显示最近 100 条分析。')),
        h('main', { className: 'rfid-main', 'aria-label': 'Current Analysis', 'aria-busy': loading || busy },
          loading && h('p', { role: 'status', className: 'rfid-muted' }, '正在读取分析…'),
          !selectedId && h('section', { className: 'rfid-panel upload-panel' },
            h('p', { className: 'rfid-eyebrow' }, 'CURRENT ANALYSIS'), h('h2', null, '上传实验结果 CSV'),
            h('p', { className: 'rfid-muted' }, '每行代表一次已完成的 experiment run。保留固定的 7 个字段。'),
            h('form', { onSubmit: upload },
              h('label', { className: 'rfid-file-label', htmlFor: 'rfid-file' }, h('span', { className: 'rfid-upload-icon', 'aria-hidden': true }, '↑'), h('strong', null, file ? file.name : '选择 CSV 文件'), h('span', null, 'UTF-8 · 最大 1 MiB · 最多 10,000 行')),
              h('input', { ref: fileInput, id: 'rfid-file', type: 'file', accept: '.csv,text/csv', onChange: chooseFile, disabled: busy || !connected }),
              h('label', { className: 'rfid-label', htmlFor: 'rfid-name' }, '分析名称'),
              h('input', { id: 'rfid-name', type: 'text', value: name, maxLength: 200, required: true, disabled: busy || !connected, placeholder: '例如：距离变化实验 · Env-1', onChange: (event) => setName(event.target.value) }),
              h('button', { className: 'rfid-button primary', type: 'submit', disabled: busy || !connected || !file || !name.trim() }, busy ? '正在上传…' : '上传并查看统计')),
            h('details', { className: 'rfid-schema' }, h('summary', null, '查看 CSV 字段要求'),
              h('code', null, 'experiment_id,distance_m,angle_deg,environment,accuracy,rssi_std,phase_dispersion'),
              h('p', null, 'accuracy 范围 0–1；experiment_id 唯一；RSSI 与 Phase 离散指标由上游实验流程计算。上传后由后端统一校验。'))),
          record && h(React.Fragment, null,
            h('section', { className: 'rfid-current' }, h('div', null, h('p', { className: 'rfid-eyebrow' }, 'CURRENT ANALYSIS'), h('h2', null, record.name), h('p', { className: 'rfid-muted' }, `${record.fileName} · ${date(record.createdAt)}`)), h(Status, { record })),
            record.status === 'DRAFT' && h('div', { className: 'rfid-workflow' }, h('p', null, 'CSV 已保存，统计已就绪。发起 Assistant 分析，生成实验解释。'), h('button', { className: 'rfid-button primary', disabled: busy || loading, onClick: analyze }, 'Analyze Experiment')),
            record.status === 'ANALYZING' && h('div', { className: 'rfid-workflow', role: 'status' }, h('span', { className: 'rfid-spinner', 'aria-hidden': true }), h('p', null, 'Assistant 正在分析… 完成后自动刷新。统计已保存，请勿重复提交。')),
            record.status === 'FAILED' && h('div', { className: 'rfid-workflow failed' }, h('div', null, h('strong', null, 'AI 分析未完成'), h('p', { role: 'alert' }, record.errorMessage), h('small', null, '统计已保留。Retry 只重试 AI 阶段，继续使用这条分析记录。')), h('button', { className: 'rfid-button primary', disabled: busy || loading, onClick: analyze }, 'Retry')),
            h(Statistics, { statistics: record.statistics }),
            record.aiSummary && h(Interpretation, { summary: record.aiSummary }),
            record.status === 'COMPLETED' && h('section', { className: 'rfid-confirm' },
              record.confirmedAt ? h('p', { role: 'status' }, `✓ 已人工确认并保存 · ${date(record.confirmedAt)}`) : h(React.Fragment, null,
                h('label', null, h('input', { type: 'checkbox', checked: reviewed, disabled: busy || loading, onChange: (event) => setReviewed(event.target.checked) }), '我已复核统计和 AI 解释，确认保存此结果。'),
                h('button', { className: 'rfid-button primary', disabled: !reviewed || busy || loading, onClick: confirm }, 'Confirm / Save')))))))
  }

  const style = document.createElement('style')
  style.textContent = `
*{box-sizing:border-box}body{margin:0;color:var(--xui-color-foreground,#173735);background:var(--xui-color-background,#f5f7f6);font:14px/1.6 Inter,"Segoe UI","Microsoft YaHei",sans-serif}button,input{font:inherit}button{cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #38b2ac;outline-offset:3px}h1,h2,h3,h4,p,dl,dd{margin:0}h1{font-size:23px;letter-spacing:-.5px}h2{font-size:19px}h3{font-size:16px}h4{font-size:13px}small{font-size:12px}.rfid-app{max-width:1320px;margin:auto;padding:28px}.rfid-header{display:flex;justify-content:space-between;align-items:center;gap:16px}.rfid-brand{display:flex;align-items:center;gap:14px}.rfid-mark{width:46px;height:46px;border-radius:12px;background:#0f766e;color:white;display:grid;place-items:center;font-size:29px}.rfid-eyebrow{font-size:10px;letter-spacing:1.7px;font-weight:700;color:var(--xui-color-muted-foreground,#5a7975);margin-bottom:4px}.rfid-intro{margin:12px 0 24px;color:var(--xui-color-muted-foreground,#59716d)}.rfid-layout{display:grid;grid-template-columns:245px minmax(0,1fr);gap:24px;align-items:start}.rfid-history{min-width:0;padding:18px 14px;border:1px solid var(--xui-color-border,#dce6e2);border-radius:14px;background:var(--xui-color-card,#fff)}.rfid-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.rfid-section-head>span{color:var(--xui-color-muted-foreground,#68817b);font-size:11px}.rfid-history h2{font-size:16px}.rfid-button{border:1px solid var(--xui-color-border,#ccdcd5);border-radius:8px;padding:9px 16px;color:inherit;background:var(--xui-color-card,#fff);font-weight:600;white-space:nowrap}.rfid-button:hover:not(:disabled){background:var(--xui-color-muted,#edf4f0)}.rfid-button.primary{background:#0f766e;border-color:#0f766e;color:#fff}.rfid-button.primary:hover:not(:disabled){background:#115e59}.rfid-button.new{width:100%;margin-bottom:16px;color:#0f766e;border-style:dashed}.rfid-history-list{display:grid;gap:7px;max-height:610px;overflow:auto}.rfid-history-item{display:grid;gap:6px;text-align:left;padding:12px;border:1px solid transparent;border-radius:9px;background:transparent;color:inherit;min-width:0;width:100%}.rfid-history-item:hover{background:var(--xui-color-muted,#f2f6f4)}.rfid-history-item.selected{border-color:#9bc7bd;background:var(--xui-color-muted,#edf6f2)}.rfid-history-item strong{overflow-wrap:anywhere;font-size:13px}.rfid-history-item small{font-size:10px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-status{font-size:10px;letter-spacing:.15px;border-radius:5px;padding:3px 7px;background:#e9f0ed;color:#4b6861;white-space:nowrap;width:fit-content;height:fit-content}.state-ANALYZING{background:#eaf2fb;color:#2d628f}.state-COMPLETED{background:#e2f3e9;color:#216e48}.state-FAILED{background:#fff0e9;color:#a94821}.rfid-main{display:grid;gap:18px;min-width:0}.rfid-panel{padding:22px;border:1px solid var(--xui-color-border,#dce6e2);background:var(--xui-color-card,#fff);border-radius:14px}.rfid-muted{color:var(--xui-color-muted-foreground,#68817b);font-size:12px;overflow-wrap:anywhere}.upload-panel>p{margin-top:10px}.upload-panel form{margin-top:20px;display:grid;gap:12px}.rfid-file-label{display:flex;min-height:150px;flex-direction:column;gap:6px;align-items:center;justify-content:center;border:1px dashed #9fbbb1;border-radius:10px;background:var(--xui-color-muted,#f8fbf9);padding:20px;cursor:pointer;text-align:center;overflow-wrap:anywhere}.rfid-file-label span:last-child{font-size:11px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-upload-icon{color:#0f766e;font-size:24px}.rfid-label{font-size:12px;font-weight:600}input[type=text]{width:100%;border:1px solid var(--xui-color-border,#ccdcd5);border-radius:8px;padding:10px 12px;color:inherit;background:var(--xui-color-card,#fff)}input[type=file]{width:100%;font-size:12px}form .primary{justify-self:start;margin-top:4px}.rfid-schema{margin-top:22px;border-top:1px solid var(--xui-color-border,#e4eae6);padding-top:15px;font-size:12px;color:var(--xui-color-muted-foreground,#59716d)}.rfid-schema summary{cursor:pointer}.rfid-schema code{display:block;overflow-wrap:anywhere;background:var(--xui-color-muted,#f3f6f4);padding:12px;margin:10px 0;border-radius:6px;font-size:11px}.rfid-current{display:flex;justify-content:space-between;gap:20px;align-items:start;padding:3px 0 0}.rfid-current h2{overflow-wrap:anywhere}.rfid-current .rfid-muted{margin-top:5px}.rfid-workflow{display:flex;align-items:center;justify-content:space-between;gap:18px;border:1px solid #cadfd7;border-radius:10px;padding:16px;background:var(--xui-color-card,#f6fbf8);font-size:12px}.rfid-workflow.failed{border-color:#efcabb;background:var(--xui-color-card,#fff9f5)}.rfid-workflow p{overflow-wrap:anywhere}.rfid-workflow small{display:block;margin-top:7px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-metrics{display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:18px}.rfid-metric dt{font-size:11px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-metric dd{font-size:23px;font-weight:650;letter-spacing:-.5px;margin:5px 0;overflow-wrap:anywhere}.rfid-metric small{font-size:10px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-conditions{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-top:1px solid var(--xui-color-border,#e4eae6);border-bottom:1px solid var(--xui-color-border,#e4eae6);margin:20px 0;padding:18px 0}.rfid-condition h4{color:var(--xui-color-muted-foreground,#68817b);font-size:11px;font-weight:500;margin-bottom:8px}.rfid-condition strong{font-size:14px;overflow-wrap:anywhere}.rfid-condition p{font-size:11px;margin-top:6px;color:var(--xui-color-muted-foreground,#68817b)}.rfid-metrics.signals{grid-template-columns:1fr 1fr}.signals dd{font-size:20px}.rfid-footnote{font-size:10px;color:var(--xui-color-muted-foreground,#68817b);margin-top:18px}.rfid-insight{padding:14px 0;border-top:1px solid var(--xui-color-border,#e4eae6)}.rfid-insight:first-of-type{padding-top:0;border-top:0}.rfid-insight p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:6px;color:var(--xui-color-muted-foreground,#506c65)}.rfid-confirm{display:flex;align-items:center;justify-content:space-between;gap:18px;border-radius:10px;padding:16px;background:var(--xui-color-card,#fff);border:1px solid var(--xui-color-border,#dce6e2);font-size:12px}.rfid-confirm label{display:flex;align-items:center;gap:9px}.rfid-confirm input{accent-color:#0f766e;width:16px;height:16px;flex-shrink:0}.rfid-confirm p{color:#216e48}.rfid-banner{padding:12px 16px;margin:0 0 18px;border-radius:9px;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.rfid-banner.error{color:#a33d25;background:#fff0e9;border:1px solid #efcabb}.rfid-banner.notice{background:#eaf4ef;color:#256448;border:1px solid #c9e2d4}.rfid-spinner{display:inline-block;width:16px;height:16px;border:2px solid #cadfd7;border-top-color:#0f766e;border-radius:50%;animation:rfid-spin 1s linear infinite;flex-shrink:0}@keyframes rfid-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.rfid-spinner{animation:none}}@media(max-width:850px){.rfid-app{padding:18px}.rfid-layout{grid-template-columns:195px minmax(0,1fr);gap:16px}.rfid-metrics{grid-template-columns:1fr 1fr}.rfid-workflow,.rfid-confirm{flex-wrap:wrap}.rfid-panel{padding:18px}.rfid-current{flex-wrap:wrap}}@media(max-width:620px){.rfid-app{padding:14px}.rfid-layout{grid-template-columns:1fr}.rfid-history-list{max-height:180px}.rfid-mark{display:none}h1{font-size:20px}.rfid-metrics,.rfid-conditions{grid-template-columns:1fr}.rfid-metrics.signals{grid-template-columns:1fr 1fr}.rfid-header{align-items:start}.rfid-header .rfid-button{padding:7px 10px}.rfid-history{padding:14px}}
`
  document.head.appendChild(style)
  ReactDOM.createRoot(document.getElementById('root')).render(h(App))
})()
