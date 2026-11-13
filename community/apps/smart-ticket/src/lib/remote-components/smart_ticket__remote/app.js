;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  injectStyles()

  function isObject(val) {
    return val && typeof val === 'object' && !Array.isArray(val)
  }

  function post(type, body) {
    if (!instanceId && type !== 'ready') return
    window.parent.postMessage(
      Object.assign(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        body || {}
      ),
      '*'
    )
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      post(type, Object.assign({ requestId }, body || {}))
      setTimeout(() => {
        if (!pending.has(requestId)) return
        pending.delete(requestId)
        reject(new Error('请求超时'))
      }, 15000)
    })
  }

  function requestData(query) {
    return request('requestData', { query: query || {} }).then((res) => res.data)
  }

  function executeAction(actionKey, input, parameters) {
    return request('executeAction', {
      actionKey,
      input: input || {},
      parameters: parameters || {}
    }).then((res) => res.result)
  }

  function appendReference(reference) {
    post('command', {
      command: 'assistant.composer.append_references',
      payload: {
        references: [reference]
      }
    })
  }

  function injectStyles() {
    if (document.getElementById('smart-ticket-style')) return
    const style = document.createElement('style')
    style.id = 'smart-ticket-style'
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        background: #f8fafc;
        color: #1e293b;
        font-size: 14px;
        line-height: 1.5;
        padding: 16px;
      }
      .app-container {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .header-bar {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      }
      .header-title {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 600;
        color: #0f172a;
      }
      .stats-badges {
        display: flex;
        gap: 8px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
      }
      .badge-p0 { background: #fee2e2; color: #dc2626; border: 1px solid #fecaca; }
      .badge-p1 { background: #ffedd5; color: #ea580c; border: 1px solid #fed7aa; }
      .badge-p2 { background: #fef9c3; color: #ca8a04; border: 1px solid #fef08a; }
      .badge-p3 { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
      .badge-confirmed { background: #dcfce7; color: #16a34a; border: 1px solid #bbf7d0; }
      .badge-pending { background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; }

      .input-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.03);
      }
      .input-title {
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #334155;
      }
      .textarea {
        width: 100%;
        min-height: 80px;
        padding: 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        resize: vertical;
        outline: none;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      .textarea:focus { border-color: #3b82f6; }
      .button-row {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 10px;
      }
      .btn {
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: #2563eb; color: #ffffff; }
      .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
      .btn-secondary { background: #ffffff; border-color: #cbd5e1; color: #334155; }
      .btn-secondary:hover:not(:disabled) { background: #f1f5f9; }
      .btn-danger { background: #ef4444; color: #ffffff; }
      .btn-danger:hover:not(:disabled) { background: #dc2626; }
      .btn-warning { background: #f59e0b; color: #ffffff; }
      .btn-warning:hover:not(:disabled) { background: #d97706; }
      .btn-success { background: #10b981; color: #ffffff; }
      .btn-success:hover:not(:disabled) { background: #059669; }

      .error-banner {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
        padding: 12px 16px;
        border-radius: 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .main-grid {
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 16px;
      }
      .list-pane {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        height: 600px;
        overflow: hidden;
      }
      .pane-header {
        padding: 12px 16px;
        border-bottom: 1px solid #e2e8f0;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8fafc;
      }
      .filter-tabs {
        display: flex;
        gap: 6px;
      }
      .tab-btn {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
        border: none;
        background: none;
        cursor: pointer;
        color: #64748b;
      }
      .tab-btn.active {
        background: #e2e8f0;
        color: #0f172a;
        font-weight: 600;
      }
      .tickets-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ticket-card {
        padding: 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
        background: #ffffff;
      }
      .ticket-card:hover {
        border-color: #94a3b8;
        box-shadow: 0 2px 4px rgba(0,0,0,0.04);
      }
      .ticket-card.selected {
        border-color: #2563eb;
        background: #eff6ff;
      }
      .ticket-card-title {
        font-weight: 600;
        font-size: 13px;
        color: #1e293b;
        margin-bottom: 6px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ticket-card-meta {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .ticket-card-time {
        font-size: 11px;
        color: #94a3b8;
        margin-left: auto;
      }

      .detail-pane {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        height: 600px;
        overflow-y: auto;
      }
      .detail-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #94a3b8;
        gap: 8px;
      }
      .form-group {
        margin-bottom: 14px;
      }
      .form-label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #475569;
        margin-bottom: 4px;
      }
      .form-input {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        outline: none;
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 12px;
      }
      .select-input {
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        font-size: 13px;
        background: #ffffff;
        outline: none;
      }
      .detail-actions {
        display: flex;
        gap: 8px;
        margin-top: auto;
        padding-top: 16px;
        border-top: 1px solid #e2e8f0;
      }
    `
    document.head.appendChild(style)
  }

  function App() {
    const [tickets, setTickets] = React.useState([])
    const [selectedId, setSelectedId] = React.useState(null)
    const [activeTab, setActiveTab] = React.useState('all')
    const [rawInput, setRawInput] = React.useState('')
    const [loading, setLoading] = React.useState(false)
    const [errorMsg, setErrorMsg] = React.useState(null)
    const [retryPayload, setRetryPayload] = React.useState(null)

    // Form edit states
    const [editTitle, setEditTitle] = React.useState('')
    const [editCategory, setEditCategory] = React.useState('billing')
    const [editPriority, setEditPriority] = React.useState('P1')
    const [editSentiment, setEditSentiment] = React.useState('neutral')
    const [editSummary, setEditSummary] = React.useState('')
    const [editReply, setEditReply] = React.useState('')

    const selectedTicket = tickets.find((t) => t.id === selectedId) || null

    React.useEffect(() => {
      if (selectedTicket) {
        setEditTitle(selectedTicket.title)
        setEditCategory(selectedTicket.category)
        setEditPriority(selectedTicket.priority)
        setEditSentiment(selectedTicket.sentiment)
        setEditSummary(selectedTicket.summary)
        setEditReply(selectedTicket.suggestedReply)
      }
    }, [selectedId, selectedTicket])

    const reloadData = React.useCallback(() => {
      setLoading(true)
      requestData({})
        .then((data) => {
          const list = (data && data.tickets) || []
          setTickets(list)
          if (list.length > 0 && !selectedId) {
            setSelectedId(list[0].id)
          }
        })
        .catch((err) => {
          setErrorMsg('加载数据失败: ' + err.message)
        })
        .finally(() => setLoading(false))
    }, [selectedId])

    React.useEffect(() => {
      const listener = (event) => {
        const raw = event.data
        if (!isObject(raw) || raw.channel !== CHANNEL || raw.protocolVersion !== VERSION) return
        if (raw.type === 'init') {
          instanceId = typeof raw.instanceId === 'string' ? raw.instanceId : null
          reloadData()
        } else if (raw.type === 'hostEvent') {
          reloadData()
        } else if (raw.type === 'actionResult' || raw.type === 'data') {
          const req = pending.get(raw.requestId)
          if (req) {
            pending.delete(raw.requestId)
            req.resolve(raw)
          }
        } else if (raw.type === 'error') {
          const req = pending.get(raw.requestId)
          if (req) {
            pending.delete(raw.requestId)
            req.reject(new Error(raw.message || '操作失败'))
          }
        }
      }

      window.addEventListener('message', listener)
      post('ready')
      reloadData()

      return () => window.removeEventListener('message', listener)
    }, [reloadData])

    const handleAnalyze = (simulateFailure) => {
      if (!rawInput.trim()) {
        setErrorMsg('请输入客诉内容')
        return
      }
      setLoading(true)
      setErrorMsg(null)
      setRetryPayload(null)

      executeAction('analyze_ticket', {
        rawContent: rawInput,
        simulateFailure: Boolean(simulateFailure)
      })
        .then((res) => {
          if (res && res.success) {
            setRawInput('')
            reloadData()
            if (res.data && res.data.ticket) {
              setSelectedId(res.data.ticket.id)
            }
          } else {
            const err = res && res.data ? res.data.message : '分析异常'
            setErrorMsg(err)
            if (simulateFailure) {
              setRetryPayload({ action: 'analyze_ticket', rawContent: rawInput })
            }
          }
        })
        .catch((err) => {
          setErrorMsg(err.message)
          if (simulateFailure) {
            setRetryPayload({ action: 'analyze_ticket', rawContent: rawInput })
          }
        })
        .finally(() => setLoading(false))
    }

    const handleRetry = () => {
      if (!retryPayload) return
      setErrorMsg(null)
      setLoading(true)
      executeAction('analyze_ticket', {
        rawContent: retryPayload.rawContent,
        simulateFailure: false
      })
        .then((res) => {
          if (res && res.success) {
            setRetryPayload(null)
            setRawInput('')
            reloadData()
            if (res.data && res.data.ticket) {
              setSelectedId(res.data.ticket.id)
            }
          } else {
            setErrorMsg(res && res.data ? res.data.message : '重试失败')
          }
        })
        .catch((err) => setErrorMsg('重试异常: ' + err.message))
        .finally(() => setLoading(false))
    }

    const handleConfirm = () => {
      if (!selectedTicket) return
      setLoading(true)
      executeAction('confirm_ticket', {
        id: selectedTicket.id,
        title: editTitle,
        category: editCategory,
        priority: editPriority,
        sentiment: editSentiment,
        summary: editSummary,
        suggestedReply: editReply
      })
        .then((res) => {
          if (res && res.success) {
            reloadData()
          } else {
            setErrorMsg(res && res.data ? res.data.message : '确认归档失败')
          }
        })
        .catch((err) => setErrorMsg(err.message))
        .finally(() => setLoading(false))
    }

    const handleDelete = () => {
      if (!selectedTicket) return
      if (!confirm('确定删除该工单记录吗？')) return
      setLoading(true)
      executeAction('delete_ticket', { id: selectedTicket.id })
        .then((res) => {
          if (res && res.success) {
            setSelectedId(null)
            reloadData()
          } else {
            setErrorMsg('删除失败')
          }
        })
        .catch((err) => setErrorMsg(err.message))
        .finally(() => setLoading(false))
    }

    const handleAppendChat = () => {
      if (!selectedTicket) return
      appendReference({
        type: 'ticket',
        id: selectedTicket.id,
        title: editTitle,
        content: `【${editCategory.toUpperCase()} | ${editPriority}】${editSummary}\n建议回复：${editReply}`
      })
    }

    const filteredTickets = tickets.filter((t) => {
      if (activeTab === 'pending') return t.status === 'pending_review'
      if (activeTab === 'confirmed') return t.status === 'confirmed'
      return true
    })

    const p0Count = tickets.filter((t) => t.priority === 'P0').length
    const pendingCount = tickets.filter((t) => t.status === 'pending_review').length
    const confirmedCount = tickets.filter((t) => t.status === 'confirmed').length

    return h(
      'div',
      { className: 'app-container' },
      h(
        'div',
        { className: 'header-bar' },
        h(
          'div',
          { className: 'header-title' },
          '🎧 智能客诉工单工作台 (Smart Ticket Agentic App)'
        ),
        h(
          'div',
          { className: 'stats-badges' },
          h('span', { className: 'badge badge-p0' }, `P0 紧急: ${p0Count}`),
          h('span', { className: 'badge badge-pending' }, `待审核: ${pendingCount}`),
          h('span', { className: 'badge badge-confirmed' }, `已归档: ${confirmedCount}`)
        )
      ),

      errorMsg &&
        h(
          'div',
          { className: 'error-banner' },
          h('span', null, `⚠️ ${errorMsg}`),
          retryPayload &&
            h(
              'button',
              {
                className: 'btn btn-primary',
                onClick: handleRetry,
                disabled: loading
              },
              '🔄 立即重试 (排除故障)'
            )
        ),

      h(
        'div',
        { className: 'input-card' },
        h('div', { className: 'input-title' }, '📥 客诉快速接入与 AI 智能意图提炼'),
        h('textarea', {
          className: 'textarea',
          placeholder:
            '粘贴客户原始反馈或投诉，例如：“昨晚升级企业版后，支付了 999 元但账单显示失败，且数据完全无法导出，系统频频 500 报错，影响我们今天开工，请尽快退款并修复！”',
          value: rawInput,
          onChange: (e) => setRawInput(e.target.value)
        }),
        h(
          'div',
          { className: 'button-row' },
          h(
            'button',
            {
              className: 'btn btn-warning',
              disabled: loading,
              onClick: () => handleAnalyze(true)
            },
            '⚡ 模拟超时失败 (测试重试机制)'
          ),
          h(
            'button',
            {
              className: 'btn btn-primary',
              disabled: loading,
              onClick: () => handleAnalyze(false)
            },
            loading ? '分析中...' : '🚀 一键 AI 分析并生成草稿'
          )
        )
      ),

      h(
        'div',
        { className: 'main-grid' },
        h(
          'div',
          { className: 'list-pane' },
          h(
            'div',
            { className: 'pane-header' },
            h('span', { style: { fontWeight: 600 } }, '工单记录列表'),
            h(
              'div',
              { className: 'filter-tabs' },
              h(
                'button',
                {
                  className: `tab-btn ${activeTab === 'all' ? 'active' : ''}`,
                  onClick: () => setActiveTab('all')
                },
                '全部'
              ),
              h(
                'button',
                {
                  className: `tab-btn ${activeTab === 'pending' ? 'active' : ''}`,
                  onClick: () => setActiveTab('pending')
                },
                '待审核'
              ),
              h(
                'button',
                {
                  className: `tab-btn ${activeTab === 'confirmed' ? 'active' : ''}`,
                  onClick: () => setActiveTab('confirmed')
                },
                '已归档'
              )
            )
          ),
          h(
            'div',
            { className: 'tickets-scroll' },
            filteredTickets.length === 0
              ? h(
                  'div',
                  {
                    style: {
                      textAlign: 'center',
                      color: '#94a3b8',
                      marginTop: 40
                    }
                  },
                  '暂无相关工单记录'
                )
              : filteredTickets.map((t) =>
                  h(
                    'div',
                    {
                      key: t.id,
                      className: `ticket-card ${selectedId === t.id ? 'selected' : ''}`,
                      onClick: () => setSelectedId(t.id)
                    },
                    h('div', { className: 'ticket-card-title' }, t.title),
                    h(
                      'div',
                      { className: 'ticket-card-meta' },
                      h(
                        'span',
                        {
                          className: `badge badge-${t.priority.toLowerCase()}`
                        },
                        t.priority
                      ),
                      h(
                        'span',
                        {
                          className: `badge ${
                            t.status === 'confirmed'
                              ? 'badge-confirmed'
                              : 'badge-pending'
                          }`
                        },
                        t.status === 'confirmed' ? '已归档' : '待审核'
                      ),
                      h(
                        'span',
                        { className: 'ticket-card-time' },
                        t.createdAt ? t.createdAt.slice(11, 16) : ''
                      )
                    )
                  )
                )
          )
        ),

        h(
          'div',
          { className: 'detail-pane' },
          !selectedTicket
            ? h(
                'div',
                { className: 'detail-empty' },
                h('div', { style: { fontSize: 36 } }, '📋'),
                h('div', null, '请在左侧选择工单查看并编辑详情')
              )
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
                h(
                  'div',
                  { className: 'form-group' },
                  h('label', { className: 'form-label' }, '工单标题'),
                  h('input', {
                    className: 'form-input',
                    value: editTitle,
                    onChange: (e) => setEditTitle(e.target.value)
                  })
                ),
                h(
                  'div',
                  { className: 'form-row' },
                  h(
                    'div',
                    { className: 'form-group' },
                    h('label', { className: 'form-label' }, '业务分类'),
                    h(
                      'select',
                      {
                        className: 'select-input',
                        value: editCategory,
                        onChange: (e) => setEditCategory(e.target.value)
                      },
                      h('option', { value: 'billing' }, '账单/扣费纠纷'),
                      h('option', { value: 'technical_issue' }, '技术系统故障'),
                      h('option', { value: 'account_security' }, '账号安全问题'),
                      h('option', { value: 'product_suggestion' }, '功能优化建议'),
                      h('option', { value: 'other' }, '其它反馈')
                    )
                  ),
                  h(
                    'div',
                    { className: 'form-group' },
                    h('label', { className: 'form-label' }, '紧急程度 (Priority)'),
                    h(
                      'select',
                      {
                        className: 'select-input',
                        value: editPriority,
                        onChange: (e) => setEditPriority(e.target.value)
                      },
                      h('option', { value: 'P0' }, 'P0 (最高紧急/资损)'),
                      h('option', { value: 'P1' }, 'P1 (核心功能受阻)'),
                      h('option', { value: 'P2' }, 'P2 (常规缺陷)'),
                      h('option', { value: 'P3' }, 'P3 (轻微建议)')
                    )
                  ),
                  h(
                    'div',
                    { className: 'form-group' },
                    h('label', { className: 'form-label' }, '用户情绪'),
                    h(
                      'select',
                      {
                        className: 'select-input',
                        value: editSentiment,
                        onChange: (e) => setEditSentiment(e.target.value)
                      },
                      h('option', { value: 'negative_urgent' }, '😡 负面急切 (优先安抚)'),
                      h('option', { value: 'neutral' }, '😐 中性客观'),
                      h('option', { value: 'positive' }, '😊 正向鼓励')
                    )
                  )
                ),
                h(
                  'div',
                  { className: 'form-group' },
                  h('label', { className: 'form-label' }, 'AI 提取的问题核心摘要'),
                  h('textarea', {
                    className: 'textarea',
                    style: { minHeight: 70 },
                    value: editSummary,
                    onChange: (e) => setEditSummary(e.target.value)
                  })
                ),
                h(
                  'div',
                  { className: 'form-group', style: { flex: 1, display: 'flex', flexDirection: 'column' } },
                  h(
                    'label',
                    { className: 'form-label' },
                    'AI 拟定回复建议 (可人工在此微调与润色)'
                  ),
                  h('textarea', {
                    className: 'textarea',
                    style: { flex: 1, minHeight: 120 },
                    value: editReply,
                    onChange: (e) => setEditReply(e.target.value)
                  })
                ),
                h(
                  'div',
                  { className: 'detail-actions' },
                  h(
                    'button',
                    {
                      className: 'btn btn-danger',
                      onClick: handleDelete,
                      disabled: loading
                    },
                    '🗑️ 删除'
                  ),
                  h(
                    'button',
                    {
                      className: 'btn btn-secondary',
                      onClick: handleAppendChat,
                      disabled: loading
                    },
                    '💬 引用至聊天对话'
                  ),
                  h('div', { style: { marginLeft: 'auto', display: 'flex', gap: 8 } },
                    h(
                      'button',
                      {
                        className: 'btn btn-success',
                        onClick: handleConfirm,
                        disabled: loading
                      },
                      '✅ 确认并归档保存 (持久化)'
                    )
                  )
                )
              )
        )
      )
    )
  }

  const container = document.getElementById('root') || document.body
  const root = ReactDOM.createRoot ? ReactDOM.createRoot(container) : null
  if (root) {
    root.render(h(App))
  } else {
    ReactDOM.render(h(App), container)
  }
})()
