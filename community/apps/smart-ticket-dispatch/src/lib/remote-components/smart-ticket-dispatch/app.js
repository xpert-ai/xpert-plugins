;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS_LABELS = {
    pending_confirmation: '待确认',
    dispatched: '已分派',
    resolved: '已解决',
    rejected: '已驳回'
  }

  const STATUS_COLORS = {
    pending_confirmation: '#b45309',
    dispatched: '#1d4ed8',
    resolved: '#15803d',
    rejected: '#6b7280'
  }

  const URGENCY_LABELS = {
    low: '低',
    medium: '中',
    high: '高'
  }

  const CATEGORY_LABELS = {
    technical: '技术问题',
    billing: '账务问题',
    logistics: '物流问题',
    consult: '使用咨询',
    complaint: '投诉',
    other: '其他'
  }

  const TEAM_LABELS = {
    technical_support: '技术支持组',
    billing: '账务组',
    logistics: '物流组',
    after_sales: '售后组',
    customer_success: '客户成功组',
    other: '其他'
  }

  const TEAM_OPTIONS = Object.keys(TEAM_LABELS)

  function isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
  }

  function post(type, body, transfer) {
    if (!instanceId && type !== 'ready') return
    parent.postMessage(
      Object.assign(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        body || {}
      ),
      '*',
      transfer || []
    )
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

  function requestData(query) {
    return request('requestData', { query: query || {} })
  }

  function executeAction(actionKey, targetId, input, parameters) {
    return request('executeAction', {
      actionKey,
      targetId,
      input,
      parameters
    })
  }

  function invokeClientCommand(commandKey, payload) {
    return request('invokeClientCommand', {
      commandKey,
      payload
    })
  }

  function notify(message, level) {
    post('notify', { message, level: level || 'success' })
  }

  function unwrapResponse(response) {
    if (!response) return {}
    if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
    if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
    if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
    return response
  }

  function buildQuery(context, overrides) {
    const payload = (context && context.payload) || {}
    const initialQuery = (context && context.initialQuery) || {}
    const overrideParameters = (overrides && overrides.parameters) || {}
    return Object.assign({ page: 1, pageSize: 20 }, initialQuery, overrides || {}, {
      parameters: Object.assign({}, payload.parameters || {}, initialQuery.parameters || {}, overrideParameters)
    })
  }

  function formatTime(value) {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const pad = (n) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
  }

  function reportResize() {
    const root = document.getElementById('root')
    const height = root ? Math.max(root.scrollHeight, 520) : 520
    post('resize', { height: Math.ceil(height), viewportBound: false })
  }

  function App() {
    const [context, setContext] = React.useState(null)
    const [tab, setTab] = React.useState('submit')
    const [tickets, setTickets] = React.useState(null)
    const [counts, setCounts] = React.useState({})
    const [statusFilter, setStatusFilter] = React.useState('')
    const [selectedId, setSelectedId] = React.useState(null)
    const [detail, setDetail] = React.useState(null)
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState(null)
    const [form, setForm] = React.useState({ originalContent: '', customerName: '', customerContact: '', channel: '在线客服' })
    const [confirmForm, setConfirmForm] = React.useState({ confirmedTeam: '', confirmedOwner: '', dispatchRemark: '' })
    const [rejectReason, setRejectReason] = React.useState('')
    const [resolution, setResolution] = React.useState('')

    React.useEffect(() => {
      window.__smartTicketSetContext = setContext
      window.__smartTicketHandleHostEvent = () => {
        window.__smartTicketReload && window.__smartTicketReload({ silent: true })
      }
      post('ready')
      return () => {
        delete window.__smartTicketSetContext
        delete window.__smartTicketHandleHostEvent
      }
    }, [])

    const loadTickets = React.useCallback(
      async (options) => {
        const nextStatus = options && options.status !== undefined ? options.status : statusFilter
        try {
          const response = await requestData(
            buildQuery(context, {
              page: 1,
              pageSize: 20,
              parameters: {
                status: nextStatus || undefined
              }
            })
          )
          const data = unwrapResponse(response) || {}
          setTickets(data)
          setCounts(data.counts || {})
          setError(null)
        } catch (err) {
          setError((err && err.message) || '加载工单数据失败')
        }
      },
      [context, statusFilter]
    )

    const loadDetail = React.useCallback(
      async (ticketId) => {
        if (!ticketId) {
          setDetail(null)
          return
        }
        try {
          const response = await requestData(buildQuery(context, { parameters: { ticketId } }))
          const data = unwrapResponse(response) || {}
          setDetail(data.detail || null)
          if (data.detail && data.detail.ticket) {
            setConfirmForm({
              confirmedTeam: data.detail.ticket.aiSuggestedTeam || '',
              confirmedOwner: data.detail.ticket.aiSuggestedOwner || '',
              dispatchRemark: ''
            })
          }
          setError(null)
        } catch (err) {
          setError((err && err.message) || '加载工单详情失败')
        }
      },
      [context]
    )

    window.__smartTicketReload = (options) => {
      loadTickets(options)
      if (selectedId) loadDetail(selectedId)
    }

    React.useEffect(() => {
      if (context) loadTickets()
    }, [context, statusFilter, loadTickets])

    async function run(fn, successMessage) {
      if (busy) return
      setBusy(true)
      setError(null)
      try {
        const response = await fn()
        const data = unwrapResponse(response) || {}
        if (successMessage) notify(successMessage)
        if (data && data.commandKey) {
          await invokeClientCommand(data.commandKey, data.payload || {})
        }
        await loadTickets()
        if (selectedId) await loadDetail(selectedId)
        return data
      } catch (err) {
        setError((err && err.message) || '操作失败，请稍后重试')
      } finally {
        setBusy(false)
      }
    }

    function submitTicket() {
      if (!form.originalContent.trim()) {
        setError('请填写工单描述')
        return
      }
      return run(
        () =>
          executeAction('submit_ticket', null, {
            originalContent: form.originalContent.trim(),
            customerName: form.customerName.trim() || undefined,
            customerContact: form.customerContact.trim() || undefined,
            channel: form.channel || undefined
          }),
        '已提交 AI 分诊，请在右侧对话中查看结果'
      ).then((data) => {
        if (data) {
          setForm({ originalContent: '', customerName: '', customerContact: '', channel: form.channel })
          setTab('review')
        }
      })
    }

    function confirmDispatch() {
      if (!detail || !detail.ticket) return
      return run(
        () =>
          executeAction(
            'confirm_dispatch',
            detail.ticket.id,
            {
              confirmedTeam: confirmForm.confirmedTeam || undefined,
              confirmedOwner: confirmForm.confirmedOwner || undefined,
              dispatchRemark: confirmForm.dispatchRemark || undefined
            },
            { ticketId: detail.ticket.id }
          ),
        '分派已确认'
      )
    }

    function rejectTicket() {
      if (!detail || !detail.ticket) return
      return run(
        () => executeAction('reject_ticket', detail.ticket.id, { reason: rejectReason }, { ticketId: detail.ticket.id }),
        '工单已驳回'
      )
    }

    function markResolved() {
      if (!detail || !detail.ticket) return
      return run(
        () =>
          executeAction(
            'mark_resolved',
            detail.ticket.id,
            { resolutionSummary: resolution },
            { ticketId: detail.ticket.id }
          ),
        '工单已标记解决'
      )
    }

    function retryTriage() {
      if (!detail || !detail.ticket) return
      return run(
        () => executeAction('retry_triage', detail.ticket.id, {}, { ticketId: detail.ticket.id }),
        '已请求 AI 重新分诊，请查看对话结果'
      )
    }

    const counts_all =
      (counts.pending_confirmation || 0) +
      (counts.dispatched || 0) +
      (counts.resolved || 0) +
      (counts.rejected || 0)

    const statusFilters = [
      { key: '', label: `全部 (${counts_all})` },
      { key: 'pending_confirmation', label: `待确认 (${counts.pending_confirmation || 0})` },
      { key: 'dispatched', label: `已分派 (${counts.dispatched || 0})` },
      { key: 'resolved', label: `已解决 (${counts.resolved || 0})` },
      { key: 'rejected', label: `已驳回 (${counts.rejected || 0})` }
    ]

    const items = (tickets && tickets.items) || []
    const ticket = detail && detail.ticket
    const logs = (detail && detail.logs) || []

    return h(
      'div',
      { className: 'std-shell' },
      h(
        'div',
        { className: 'std-tabs' },
        h(
          'button',
          {
            className: 'std-tab' + (tab === 'submit' ? ' std-tab-active' : ''),
            onClick: () => setTab('submit')
          },
          '工单提交'
        ),
        h(
          'button',
          {
            className: 'std-tab' + (tab === 'review' ? ' std-tab-active' : ''),
            onClick: () => setTab('review')
          },
          '审核台'
        ),
        h(
          'button',
          {
            className: 'std-refresh',
            onClick: () => {
              loadTickets()
              if (selectedId) loadDetail(selectedId)
            },
            disabled: busy
          },
          '↻ 刷新'
        )
      ),
      error && h('div', { className: 'std-error' }, error),
      tab === 'submit' && h('div', { className: 'std-card' }, renderSubmitForm()),
      tab === 'review' &&
        h(
          'div',
          { className: 'std-review' },
          h(
            'div',
            { className: 'std-filters' },
            statusFilters.map((f) =>
              h(
                'button',
                {
                  key: f.key,
                  className: 'std-filter' + (statusFilter === f.key ? ' std-filter-active' : ''),
                  onClick: () => setStatusFilter(f.key)
                },
                f.label
              )
            )
          ),
          h(
            'div',
            { className: 'std-columns' },
            h(
              'div',
              { className: 'std-card std-list' },
              tickets === null
                ? h('div', { className: 'std-empty' }, '加载中…')
                : items.length === 0
                  ? h('div', { className: 'std-empty' }, '暂无工单。切换到“工单提交”提交第一条客服工单。')
                  : items.map((t) =>
                      h(
                        'div',
                        {
                          key: t.id,
                          className: 'std-row' + (selectedId === t.id ? ' std-row-active' : ''),
                          onClick: () => {
                            setSelectedId(t.id)
                            loadDetail(t.id)
                          }
                        },
                        h(
                          'div',
                          { className: 'std-row-top' },
                          h('span', { className: 'std-no' }, t.ticketNo),
                          h(
                            'span',
                            { className: 'std-chip', style: { color: STATUS_COLORS[t.status] } },
                            STATUS_LABELS[t.status] || t.status
                          )
                        ),
                        h('div', { className: 'std-title' }, t.title || t.originalContent),
                        h(
                          'div',
                          { className: 'std-meta' },
                          [
                            t.category ? CATEGORY_LABELS[t.category] || t.category : null,
                            t.urgency ? `紧急度：${URGENCY_LABELS[t.urgency] || t.urgency}` : null,
                            formatTime(t.createdAt)
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        )
                      )
                    )
            ),
            h(
              'div',
              { className: 'std-card std-detail' },
              !ticket
                ? h('div', { className: 'std-empty' }, '从左侧选择一个工单查看详情')
                : h(
                    'div',
                    null,
                    h(
                      'div',
                      { className: 'std-detail-head' },
                      h('div', { className: 'std-detail-title' }, `${ticket.ticketNo} ${ticket.title || ''}`),
                      h(
                        'span',
                        { className: 'std-chip', style: { color: STATUS_COLORS[ticket.status] } },
                        STATUS_LABELS[ticket.status] || ticket.status
                      )
                    ),
                    h(
                      'div',
                      { className: 'std-section' },
                      h('div', { className: 'std-section-title' }, '客户问题'),
                      h('div', { className: 'std-pre' }, ticket.originalContent),
                      h(
                        'div',
                        { className: 'std-meta' },
                        [
                          ticket.customerName ? `客户：${ticket.customerName}` : null,
                          ticket.channel ? `渠道：${ticket.channel}` : null,
                          ticket.retryCount ? `重新分诊 ${ticket.retryCount} 次` : null
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      )
                    ),
                    h(
                      'div',
                      { className: 'std-section' },
                      h('div', { className: 'std-section-title' }, 'AI 分诊建议'),
                      h(
                        'div',
                        { className: 'std-ai-grid' },
                        h('div', null, '类别：', ticket.category ? CATEGORY_LABELS[ticket.category] || ticket.category : '未分类'),
                        h('div', null, '紧急度：', ticket.urgency ? URGENCY_LABELS[ticket.urgency] || ticket.urgency : '未评估'),
                        h(
                          'div',
                          null,
                          '建议团队：',
                          ticket.aiSuggestedTeam ? TEAM_LABELS[ticket.aiSuggestedTeam] || ticket.aiSuggestedTeam : '待定'
                        ),
                        h('div', null, '建议负责人：', ticket.aiSuggestedOwner || '待定'),
                        ticket.aiConfidence != null ? h('div', null, `置信度：${Math.round(ticket.aiConfidence * 100)}%`) : null
                      ),
                      ticket.aiSummary && h('div', { className: 'std-pre' }, ticket.aiSummary),
                      ticket.aiDispatchAdvice && h('div', { className: 'std-pre' }, `处理建议：${ticket.aiDispatchAdvice}`),
                      ticket.completenessTips &&
                        ticket.completenessTips.length > 0 &&
                        h(
                          'div',
                          { className: 'std-tips' },
                          '待补充信息：' + ticket.completenessTips.join('；')
                        )
                    ),
                    ticket.status === 'pending_confirmation' &&
                      h(
                        'div',
                        { className: 'std-section' },
                        h('div', { className: 'std-section-title' }, '人工确认分派'),
                        h(
                          'select',
                          {
                            className: 'std-input',
                            value: confirmForm.confirmedTeam,
                            onChange: (e) => setConfirmForm({ ...confirmForm, confirmedTeam: e.target.value })
                          },
                          h('option', { value: '' }, '选择处理团队（默认用 AI 建议）'),
                          TEAM_OPTIONS.map((key) => h('option', { key, value: key }, TEAM_LABELS[key]))
                        ),
                        h('input', {
                          className: 'std-input',
                          placeholder: '处理负责人（默认用 AI 建议）',
                          value: confirmForm.confirmedOwner,
                          onChange: (e) => setConfirmForm({ ...confirmForm, confirmedOwner: e.target.value })
                        }),
                        h('input', {
                          className: 'std-input',
                          placeholder: '分派备注（可选）',
                          value: confirmForm.dispatchRemark,
                          onChange: (e) => setConfirmForm({ ...confirmForm, dispatchRemark: e.target.value })
                        }),
                        h(
                          'div',
                          { className: 'std-actions' },
                          h(
                            'button',
                            { className: 'std-btn std-btn-primary', onClick: confirmDispatch, disabled: busy },
                            '确认分派'
                          ),
                          h(
                            'button',
                            { className: 'std-btn', onClick: retryTriage, disabled: busy },
                            '重新分诊'
                          )
                        ),
                        h('input', {
                          className: 'std-input',
                          placeholder: '驳回原因（点驳回时必填）',
                          value: rejectReason,
                          onChange: (e) => setRejectReason(e.target.value)
                        }),
                        h(
                          'button',
                          { className: 'std-btn', onClick: rejectTicket, disabled: busy || !rejectReason.trim() },
                          '驳回工单'
                        )
                      ),
                    ticket.status === 'dispatched' &&
                      h(
                        'div',
                        { className: 'std-section' },
                        h('div', { className: 'std-section-title' }, '处理结果'),
                        h('input', {
                          className: 'std-input',
                          placeholder: '处理结果摘要',
                          value: resolution,
                          onChange: (e) => setResolution(e.target.value)
                        }),
                        h(
                          'button',
                          { className: 'std-btn std-btn-primary', onClick: markResolved, disabled: busy },
                          '标记解决'
                        )
                      ),
                    ticket.status === 'rejected' &&
                      h('div', { className: 'std-section' }, h('div', { className: 'std-pre' }, `驳回原因：${ticket.rejectReason || '未填写'}`)),
                    ticket.status === 'resolved' &&
                      h('div', { className: 'std-section' }, h('div', { className: 'std-pre' }, `处理结果：${ticket.resolutionSummary || '未填写'}`)),
                    h(
                      'div',
                      { className: 'std-section' },
                      h('div', { className: 'std-section-title' }, '操作记录'),
                      logs.length === 0
                        ? h('div', { className: 'std-meta' }, '暂无记录')
                        : logs.map((logItem) =>
                            h(
                              'div',
                              { key: logItem.id, className: 'std-log' },
                              `${formatTime(logItem.createdAt)} · ${logItem.detail || logItem.action}`
                            )
                          )
                    )
                  )
            )
          )
        )
    )

    function renderSubmitForm() {
      return h(
        'div',
        { className: 'std-form' },
        h('div', { className: 'std-form-title' }, '记录客户问题，交给 AI 分诊'),
        h('div', { className: 'std-form-desc' }, '填写后点击“提交 AI 分诊”，AI 会自动分类并给出分派建议；分派需要人工在审核台确认后才会执行。'),
        h('textarea', {
          className: 'std-input std-textarea',
          placeholder: '请描述客户的问题（必填），例如：客户反馈上周开通的会员无法使用优惠券下单，提示“优惠券不可用”。',
          value: form.originalContent,
          onChange: (e) => setForm({ ...form, originalContent: e.target.value })
        }),
        h('input', {
          className: 'std-input',
          placeholder: '客户名称（可选）',
          value: form.customerName,
          onChange: (e) => setForm({ ...form, customerName: e.target.value })
        }),
        h('input', {
          className: 'std-input',
          placeholder: '联系方式（可选）',
          value: form.customerContact,
          onChange: (e) => setForm({ ...form, customerContact: e.target.value })
        }),
        h(
          'select',
          {
            className: 'std-input',
            value: form.channel,
            onChange: (e) => setForm({ ...form, channel: e.target.value })
          },
          ['在线客服', '电话', '邮件', 'APP', '其他'].map((c) => h('option', { key: c, value: c }, c))
        ),
        h(
          'button',
          { className: 'std-btn std-btn-primary std-submit', onClick: submitTicket, disabled: busy },
          busy ? '提交中…' : '提交 AI 分诊'
        )
      )
    }
  }

  const rootElement = document.getElementById('root')
  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootElement).render(h(App))
  } else {
    ReactDOM.render(h(App), rootElement)
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__smartTicketSetContext &&
        window.__smartTicketSetContext({
          manifest: message.manifest,
          payload: message.payload,
          initialQuery: message.initialQuery || {},
          locale: message.locale,
          theme: message.theme
        })
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      window.__smartTicketHandleHostEvent && window.__smartTicketHandleHostEvent(message.event)
      return
    }

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || '远程请求失败'))
      } else {
        item.resolve(message)
      }
    }
  })

  const STYLE = `
    .std-shell { font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; padding: 12px 14px; }
    .std-tabs { display: flex; gap: 8px; align-items: center; margin-bottom: 10px; }
    .std-tab { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 6px 14px; font-size: 14px; cursor: pointer; }
    .std-tab-active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .std-refresh { margin-left: auto; border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
    .std-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; }
    .std-error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; border-radius: 8px; padding: 8px 10px; font-size: 13px; margin-bottom: 10px; }
    .std-form { display: flex; flex-direction: column; gap: 10px; max-width: 640px; }
    .std-form-title { font-size: 15px; font-weight: 600; }
    .std-form-desc { font-size: 12px; color: #6b7280; }
    .std-input { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; }
    .std-textarea { min-height: 90px; resize: vertical; }
    .std-submit { align-self: flex-start; }
    .std-btn { border: 1px solid #d1d5db; background: #fff; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
    .std-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .std-btn-primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .std-review { display: flex; flex-direction: column; gap: 10px; }
    .std-filters { display: flex; gap: 6px; flex-wrap: wrap; }
    .std-filter { border: 1px solid #d1d5db; background: #fff; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
    .std-filter-active { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .std-columns { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.4fr); gap: 10px; align-items: start; }
    .std-list { display: flex; flex-direction: column; gap: 8px; }
    .std-row { border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px; cursor: pointer; }
    .std-row-active { border-color: #1d4ed8; background: #eff6ff; }
    .std-row-top { display: flex; justify-content: space-between; gap: 8px; }
    .std-no { font-weight: 600; font-size: 12px; }
    .std-chip { font-size: 12px; font-weight: 600; white-space: nowrap; }
    .std-title { font-size: 13px; margin: 4px 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .std-meta { font-size: 11px; color: #6b7280; }
    .std-empty { color: #6b7280; font-size: 13px; text-align: center; padding: 24px 8px; }
    .std-detail-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .std-detail-title { font-size: 14px; font-weight: 600; }
    .std-section { border-top: 1px solid #f3f4f6; padding: 10px 0; display: flex; flex-direction: column; gap: 8px; }
    .std-section-title { font-size: 13px; font-weight: 600; color: #374151; }
    .std-pre { white-space: pre-wrap; font-size: 13px; background: #f9fafb; border-radius: 8px; padding: 8px; }
    .std-ai-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; font-size: 13px; }
    .std-tips { font-size: 12px; color: #92400e; background: #fffbeb; border-radius: 8px; padding: 6px 8px; }
    .std-actions { display: flex; gap: 8px; }
    .std-log { font-size: 12px; color: #4b5563; padding: 4px 0; border-bottom: 1px dashed #f3f4f6; }
  `

  function injectStyle() {
    const style = document.createElement('style')
    style.textContent = STYLE
    document.head.appendChild(style)
  }

  injectStyle()
})()
