;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
  const AGENT_RESULT_POLL_INTERVAL_MS = 4000
  const AGENT_RESULT_POLL_MAX_ATTEMPTS = 15
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS_LABELS = {
    pending_confirmation: '待确认',
    needs_supplement: '待补充',
    confirmed: '已受理',
    in_progress: '采集中',
    completed: '已完成',
    rejected: '已驳回'
  }

  const STATUS_COLORS = {
    pending_confirmation: '#2563eb',
    needs_supplement: '#d97706',
    confirmed: '#0f766e',
    in_progress: '#7c3aed',
    completed: '#16a34a',
    rejected: '#dc2626'
  }

  const PRIORITY_LABELS = { low: '低', medium: '一般', high: '紧急' }

  const FREQUENCY_LABELS = { once: '一次性', daily: '每日更新', weekly: '每周更新', monthly: '每月更新', manual: '手动触发' }

  const FORMAT_LABELS = { csv: 'CSV 文件', json: 'JSON 文件', excel: 'Excel 文件', database: '写入数据库' }

  const PAGES_SCOPE_LABELS = { list: '仅列表页', detail: '列表 + 详情页', search: '搜索页 + 详情页', full_site: '全站遍历' }

  const LOG_ACTION_LABELS = {
    ai_generated: 'AI 生成任务书',
    updated: '人工修改',
    needs_supplement: '标记待补充',
    supplement_draft: 'AI 补充草稿',
    supplement_saved: '保存补充',
    confirmed: '确认受理',
    started: '开始采集',
    completed: '标记完成',
    rejected: '驳回关闭',
    dedupe_skipped: '重复提交跳过'
  }

  const SAMPLE_REQUEST = {
    originalContent:
      '需要采集某电商平台笔记本电脑类目下前 100 个商品的名称、价格、店铺名、销量和评价数，每周更新一次，导出 Excel 给我。',
    requesterName: '',
    requesterDepartment: ''
  }

  const EMPTY_DETAIL_FORM = {
    title: '',
    targetUrl: '',
    targetSite: '',
    pagesScope: '',
    crawlFrequency: '',
    deliveryFormat: '',
    estimatedVolume: '',
    authRequired: false,
    priority: 'medium',
    antiBotNotes: '',
    complianceNotes: '',
    assigneeName: '',
    dataFields: []
  }

  function isObject(value) {
    return Boolean(value) && typeof value === 'object'
  }

  function post(type, body, transfer) {
    window.parent &&
      window.parent.postMessage(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        body || {}
      )
    window.parent &&
      window.parent.postMessage(
        {
          channel: CHANNEL,
          protocolVersion: VERSION,
          instanceId,
          type
        },
        '*',
        transfer || []
      )
  }

  function request(type, body) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        window.parent.postMessage(
          Object.assign({ channel: CHANNEL, protocolVersion: VERSION, instanceId, type, requestId }, body || {}),
          '*'
        )
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
    return request('executeAction', { actionKey, targetId, input, parameters })
  }

  function invokeClientCommand(commandKey, payload) {
    return request('invokeClientCommand', { commandKey, payload })
  }

  function notify(message, level) {
    post('notify', { message, level: level || 'success' })
  }

  function reportResize() {
    const root = document.getElementById('root')
    const shell = root && root.firstElementChild
    const content = shell && shell.querySelector('.sti-content')
    const header = shell && shell.querySelector('.sti-system-header')
    const shellRectHeight = shell && shell.getBoundingClientRect ? shell.getBoundingClientRect().height : 0
    const headerHeight = header && header.getBoundingClientRect ? header.getBoundingClientRect().height : 0
    const scrollContentHeight = content ? content.scrollHeight + headerHeight : 0
    const contentHeight = Math.max(scrollContentHeight, shell ? shell.scrollHeight : 0, shellRectHeight, 520)
    const viewportHeight = window.innerHeight || contentHeight
    post('resize', { height: Math.ceil(contentHeight), viewportBound: contentHeight > viewportHeight })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) return

    if (message.type === 'init') {
      instanceId = message.instanceId
      window.__stiSetContext &&
        window.__stiSetContext({
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
      window.__stiHandleHostEvent && window.__stiHandleHostEvent(message.event)
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

  function unwrapResponse(response) {
    if (!response) return {}
    if (Object.prototype.hasOwnProperty.call(response, 'data')) return response.data
    if (Object.prototype.hasOwnProperty.call(response, 'result')) return response.result
    if (Object.prototype.hasOwnProperty.call(response, 'payload')) return response.payload
    return response
  }

  function formatLoadError(error) {
    const message = error && error.message ? String(error.message) : ''
    if (
      message.includes('Http failure response') &&
      (message.includes(' 0 ') || message.includes(': 0 ') || message.includes('status: 0') || message.includes('Unknown Error'))
    ) {
      return '刷新被中断，请稍后重试。'
    }
    if (message.includes('Unknown Error')) return '刷新被中断，请稍后重试。'
    return message || '加载采集需求数据失败。'
  }

  function buildQuery(context, overrides) {
    const payload = (context && context.payload) || {}
    const initialQuery = (context && context.initialQuery) || {}
    const overrideParameters = (overrides && overrides.parameters) || {}
    return Object.assign({ page: 1, pageSize: 20 }, initialQuery, overrides || {}, {
      parameters: Object.assign({}, payload.parameters || {}, initialQuery.parameters || {}, overrideParameters)
    })
  }

  function App() {
    const [context, setContext] = React.useState(null)

    React.useEffect(() => {
      window.__stiSetContext = setContext
      window.__stiHandleHostEvent = () => {
        window.__stiReload && window.__stiReload()
      }
      post('ready')
      return () => {
        delete window.__stiSetContext
        delete window.__stiHandleHostEvent
        delete window.__stiReload
      }
    }, [])

    React.useEffect(() => {
      const root = document.getElementById('root')
      if (!root || typeof ResizeObserver === 'undefined') return undefined
      const observer = new ResizeObserver(() => setTimeout(reportResize, 0))
      observer.observe(root)
      return () => observer.disconnect()
    }, [])

    React.useEffect(() => {
      setTimeout(reportResize, 0)
    })

    if (!context) {
      return h('main', { className: 'sti-shell' }, h('div', { className: 'sti-empty' }, '正在初始化采集需求受理台...'))
    }

    return h(Workbench, { context })
  }

  function Workbench({ context }) {
    const [tab, setTab] = React.useState('report')
    const [data, setData] = React.useState({ items: [], total: 0, summary: {}, meta: {} })
    const [filters, setFilters] = React.useState({ status: '', priority: '', search: '' })
    const [reportForm, setReportForm] = React.useState(() => ({ ...SAMPLE_REQUEST }))
    const [selected, setSelected] = React.useState(null)
    const [detailForm, setDetailForm] = React.useState({})
    const [busy, setBusy] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    const [dialog, setDialog] = React.useState(null)
    const [aiFeedback, setAiFeedback] = React.useState('')
    const pollTokenRef = React.useRef(0)
    const pollAttemptsRef = React.useRef(0)
    const latestTaskRef = React.useRef(null)

    React.useEffect(() => {
      window.__stiReload = () => loadData({ feedbackFromTool: true })
      loadData()
      return () => {
        pollTokenRef.current += 1
        delete window.__stiReload
      }
    }, [context])

    React.useEffect(() => {
      setTimeout(reportResize, 60)
    }, [tab, selected, notice, aiFeedback, data])

    async function loadData(options) {
      const feedbackFromTool = options && options.feedbackFromTool
      const workbenchQuery = buildQuery(context, {
        parameters: {
          status: (options && options.status) || filters.status || '',
          priority: filters.priority || '',
          search: filters.search || ''
        }
      })
      try {
        const response = await requestData(workbenchQuery)
        const payload = unwrapResponse(response) || {}
        const items = Array.isArray(payload.items) ? payload.items : []
        const nextSelectedId = (options && options.taskId) || (selected && selected.id) || (payload.item && payload.item.id) || (items[0] && items[0].id)
        setData({ items, total: payload.total || 0, summary: payload.summary || {}, meta: payload.meta || {} })
        const nextItem = nextSelectedId ? payload.item && payload.item.id === nextSelectedId ? payload.item : null : null
        if (nextItem) {
          applyDetail(nextItem)
        } else {
          setSelected(nextItem || null)
          setDetailForm({})
        }
        if (feedbackFromTool) {
          setAiFeedback('AI 处理完成，列表已更新。')
          pollTokenRef.current += 1
        }
        if (items[0] && latestTaskRef.current && latestTaskRef.current.createdAt !== items[0].createdAt) {
          latestTaskRef.current = items[0]
        }
        if (!latestTaskRef.current && items[0]) {
          latestTaskRef.current = items[0]
        }
        return true
      } catch (error) {
        setNotice({ kind: 'error', text: formatLoadError(error) })
        return false
      } finally {
        setBusy(false)
      }
    }

    function applyDetail(item) {
      setSelected(item)
      setDetailForm(
        Object.assign({}, EMPTY_DETAIL_FORM, {
          title: item.title || '',
          targetUrl: item.targetUrl || '',
          targetSite: item.targetSite || '',
          pagesScope: item.pagesScope || '',
          crawlFrequency: item.crawlFrequency || '',
          deliveryFormat: item.deliveryFormat || '',
          estimatedVolume: item.estimatedVolume || '',
          authRequired: Boolean(item.authRequired),
          priority: item.priority || 'medium',
          antiBotNotes: item.antiBotNotes || '',
          complianceNotes: item.complianceNotes || '',
          assigneeName: (item.confirmed && item.confirmed.assigneeName) || '',
          dataFields: (item.dataFields || []).map(function (field) {
            return { name: field.name || '', description: field.description || '', example: field.example || '', required: Boolean(field.required) }
          })
        })
      )
    }

    function applySupplementDraft(draft) {
      if (!draft) return
      setDetailForm(function (prev) {
        return Object.assign({}, prev, {
          title: draft.title || prev.title,
          targetUrl: draft.targetUrl || prev.targetUrl,
          targetSite: draft.targetSite || prev.targetSite,
          pagesScope: draft.pagesScope || prev.pagesScope,
          crawlFrequency: draft.crawlFrequency || prev.crawlFrequency,
          deliveryFormat: draft.deliveryFormat || prev.deliveryFormat,
          estimatedVolume: draft.estimatedVolume || prev.estimatedVolume,
          authRequired: typeof draft.authRequired === 'boolean' ? draft.authRequired : prev.authRequired,
          priority: draft.priority || prev.priority,
          antiBotNotes: draft.antiBotNotes || prev.antiBotNotes,
          complianceNotes: draft.complianceNotes || prev.complianceNotes,
          dataFields: Array.isArray(draft.dataFields) && draft.dataFields.length
            ? draft.dataFields.map(function (field) {
                return { name: field.name || '', description: field.description || '', example: field.example || '', required: Boolean(field.required) }
              })
            : prev.dataFields
        })
      })
    }

    async function runAction(actionKey, input, options) {
      const targetId = selected ? selected.id : undefined
      setBusy(true)
      try {
        const response = await executeAction(actionKey, targetId, input, (options && options.parameters) || {})
        const payload = unwrapResponse(response) || {}
        if (!payload.success) {
          setNotice({ kind: 'error', text: payload.message && payload.message.zh_Hans ? payload.message.zh_Hans : payload.message || '操作失败' })
          return false
        }
        if (payload.data && payload.data.commandKey) {
          await invokeClientCommand(payload.data.commandKey, payload.data.payload || {})
        }
        setNotice({ kind: 'success', text: payload.message && payload.message.zh_Hans ? payload.message.zh_Hans : payload.message || '操作完成' })
        return true
      } catch (error) {
        setNotice({ kind: 'error', text: error && error.message ? error.message : '操作失败，请重试' })
        return false
      } finally {
        setBusy(false)
      }
    }

    async function sendReport() {
      if (!String(reportForm.originalContent || '').trim()) {
        setNotice({ kind: 'error', text: '请先填写采集需求内容。' })
        return
      }
      const ok = await runAction('prepare_report_chat_message', {
        originalContent: reportForm.originalContent,
        requesterName: reportForm.requesterName,
        requesterDepartment: reportForm.requesterDepartment
      })
      if (!ok) return
      setReportForm({ originalContent: '', requesterName: '', requesterDepartment: '' })
      setTab('review')
      setAiFeedback('已发送给 Assistant，正在生成任务书…')
      startAgentPolling()
    }

    function startAgentPolling() {
      pollTokenRef.current += 1
      const token = pollTokenRef.current
      pollAttemptsRef.current = 0
      const timer = window.setInterval(function () {
        if (pollTokenRef.current !== token) {
          window.clearInterval(timer)
          return
        }
        pollAttemptsRef.current += 1
        if (pollAttemptsRef.current > AGENT_RESULT_POLL_MAX_ATTEMPTS) {
          window.clearInterval(timer)
          setAiFeedback('仍在处理中，可稍后手动刷新查看结果。')
          return
        }
        loadData({ feedbackFromTool: true }).then(function (ok) {
          if (ok && latestTaskRef.current && pollAttemptsRef.current > 1) {
            const newest = latestTaskRef.current
            if (newest && data.items.length && newest.createdAt !== data.items[0].createdAt) {
              window.clearInterval(timer)
            }
          }
        })
      }, AGENT_RESULT_POLL_INTERVAL_MS)
    }

    async function submitDetailAction(actionKey) {
      const ok = await runAction(actionKey, detailForm)
      if (ok) {
        await loadData({})
        setDialog(null)
      }
    }

    function openDialog(kind) {
      setDialog(kind === 'reject' ? { kind, reason: '' } : kind === 'needs_supplement' ? { kind, reason: '' } : kind === 'complete' ? { kind, summary: '' } : { kind, content: '' })
    }

    function renderHeader() {
      return h(
        'header',
        { className: 'sti-system-header' },
        h('div', { className: 'sti-header-title' }, '采集需求受理台'),
        h(
          'div',
          { className: 'sti-header-tabs' },
          h(
            'button',
            { key: 'report', className: 'sti-tab' + (tab === 'report' ? ' sti-tab-active' : ''), onClick: () => setTab('report') },
            '提交需求'
          ),
          h(
            'button',
            { key: 'review', className: 'sti-tab' + (tab === 'review' ? ' sti-tab-active' : ''), onClick: () => setTab('review') },
            '任务审核',
            data.total ? h('span', { className: 'sti-tab-count' }, String(data.total)) : null
          )
        ),
        h(
          'div',
          { className: 'sti-header-actions' },
          h(
            'button',
            { className: 'sti-btn sti-btn-ghost', onClick: () => loadData({}), title: '刷新' },
            busy ? '刷新中…' : '刷新'
          )
        )
      )
    }

    function renderNotice() {
      if (!notice) return null
      return h(
        'div',
        { className: 'sti-notice sti-notice-' + (notice.kind || 'success') },
        h('span', null, notice.text),
        h(
          'button',
          {
            className: 'sti-notice-close',
            onClick: () => {
              setNotice('')
            }
          },
          '×'
        )
      )
    }

    function renderReportEntry() {
      const meta = data.meta || {}
      const catalog = meta.catalog || {}
      const siteTemplates = catalog.siteTemplates || []
      const checklist = catalog.complianceChecklist || []
      return h(
        'div',
        { className: 'sti-content sti-report-content' },
        h('section', { className: 'sti-section' }, h('div', { className: 'sti-section-header' }, h('h3', null, '用自然语言描述采集需求')), h('div', { className: 'sti-divider' }), h('div', { className: 'sti-section-body' },
          h('textarea', {
            className: 'sti-textarea',
            rows: 6,
            placeholder: '例如：需要采集某电商平台笔记本电脑类目下前 100 个商品的名称、价格、店铺名、销量和评价数，每周更新一次，导出 Excel。',
            value: reportForm.originalContent || '',
            onChange: (event) => setReportForm(Object.assign({}, reportForm, { originalContent: event.target.value }))
          }),
          h(
            'div',
            { className: 'sti-form-row' },
            h('input', {
              className: 'sti-input',
              placeholder: '需求人（选填）',
              value: reportForm.requesterName || '',
              onChange: (event) => setReportForm(Object.assign({}, reportForm, { requesterName: event.target.value }))
            }),
            h('input', {
              className: 'sti-input',
              placeholder: '部门（选填）',
              value: reportForm.requesterDepartment || '',
              onChange: (event) => setReportForm(Object.assign({}, reportForm, { requesterDepartment: event.target.value }))
            })
          ),
          h(
            'div',
            { className: 'sti-actions' },
            h(
              'button',
              { className: 'sti-btn sti-btn-primary', disabled: busy, onClick: sendReport },
              busy ? '处理中…' : '发送给 Assistant 生成任务书'
            )
          ),
          aiFeedback ? h('div', { className: 'sti-feedback' }, aiFeedback) : null
        )),
        siteTemplates.length
          ? h(
              'section',
              { className: 'sti-section' },
              h('div', { className: 'sti-section-header' }, h('h3', null, '站点类型字段模板')),
              h('div', { className: 'sti-divider' }),
              h('div', { className: 'sti-section-body' },
                siteTemplates.map(function (template) {
                  return h(
                    'div',
                    { key: template.key, className: 'sti-catalog-card' },
                    h('div', { className: 'sti-catalog-title' }, template.name),
                    h('div', { className: 'sti-catalog-desc' }, template.description),
                    h(
                      'div',
                      { className: 'sti-catalog-fields' },
                      (template.fieldTemplates || []).map(function (field) {
                        return h(
                          'span',
                          { key: field.name, className: 'sti-chip' },
                          field.name + (field.required ? ' *' : '')
                        )
                      })
                    )
                  )
                })
              )
            )
          : null,
        checklist.length
          ? h(
              'section',
              { className: 'sti-section' },
              h('div', { className: 'sti-section-header' }, h('h3', null, '合规清单')),
              h('div', { className: 'sti-divider' }),
              h(
                'div',
                { className: 'sti-section-body' },
                h(
                  'ul',
                  { className: 'sti-checklist' },
                  checklist.map(function (item) {
                    return h('li', { key: item }, item)
                  })
                )
              )
            )
          : null
      )
    }

    function renderReviewDesk() {
      const stats = (data.summary && data.summary.stats) || {}
      const statusCount = Object.keys(STATUS_LABELS).reduce(function (sum, key) {
        return sum + (stats[key] || 0)
      }, 0)
      return h(
        'div',
        { className: 'sti-content sti-review-content' },
        h(
          'div',
          { className: 'sti-review-left' },
          h('div', { className: 'sti-filter-bar' },
            h('input', {
              className: 'sti-input sti-filter-search',
              placeholder: '搜索工单号 / 标题 / 站点 / 需求人',
              value: filters.search || '',
              onChange: (event) => {
                setFilters(Object.assign({}, filters, { search: event.target.value }))
                loadData({ status: filters.status, priority: filters.priority, search: event.target.value })
              }
            }),
            h('select', {
              className: 'sti-select',
              value: filters.status || '',
              onChange: (event) => {
                const status = event.target.value
                setFilters(Object.assign({}, filters, { status }))
                loadData({ status })
              }
            }, h('option', { value: '' }, '全部状态'), Object.keys(STATUS_LABELS).map(function (key) {
              return h('option', { key: key, value: key }, STATUS_LABELS[key] + (stats[key] ? ' (' + stats[key] + ')' : ''))
            })),
            h('select', {
              className: 'sti-select',
              value: filters.priority || '',
              onChange: (event) => {
                const priority = event.target.value
                setFilters(Object.assign({}, filters, { priority }))
                loadData({ priority })
              }
            }, h('option', { value: '' }, '全部优先级'), Object.keys(PRIORITY_LABELS).map(function (key) {
              return h('option', { key: key, value: key }, PRIORITY_LABELS[key])
            }))
          ),
          data.items.length === 0
            ? h('div', { className: 'sti-empty' }, '暂无任务。切换到「提交需求」标签页，用自然语言描述你的采集需求。')
            : h(
                'div',
                { className: 'sti-task-list' },
                data.items.map(function (item) {
                  const active = selected && selected.id === item.id
                  return h(
                    'button',
                    {
                      key: item.id,
                      className: 'sti-task-row' + (active ? ' sti-task-row-active' : ''),
                      onClick: () => loadData({ taskId: item.id })
                    },
                    h('div', { className: 'sti-task-row-top' },
                      h('span', { className: 'sti-task-no' }, item.taskNo),
                      h('span', { className: 'sti-badge', style: { borderColor: STATUS_COLORS[item.status], color: STATUS_COLORS[item.status] } }, STATUS_LABELS[item.status] || item.status)
                    ),
                    h('div', { className: 'sti-task-title' }, item.title || '采集需求'),
                    h('div', { className: 'sti-task-meta' },
                      item.targetSite ? h('span', { className: 'sti-task-site' }, item.targetSite) : null,
                      item.priority ? h('span', { className: 'sti-task-priority' }, PRIORITY_LABELS[item.priority] || item.priority) : null,
                      item.requesterName ? h('span', null, item.requesterName) : null
                    ),
                    item.completenessTipsCount
                      ? h('div', { className: 'sti-task-tip' }, '待补充 ' + item.completenessTipsCount + ' 项')
                      : null
                  )
                })
              )
          )
        ),
        selected ? renderDetail() : h('div', { className: 'sti-review-right sti-empty' }, statusCount ? '请选择一条任务查看详情' : '')
      )
    }

    function fieldRow(field, index, onChange, onRemove) {
      return h(
        'div',
        { key: index, className: 'sti-field-row' },
        h('input', {
          className: 'sti-input sti-field-name',
          placeholder: '字段名',
          value: field.name || '',
          onChange: (event) => onChange(index, 'name', event.target.value)
        }),
        h('input', {
          className: 'sti-input sti-field-desc',
          placeholder: '说明（选填）',
          value: field.description || '',
          onChange: (event) => onChange(index, 'description', event.target.value)
        }),
        h('input', {
          className: 'sti-input sti-field-example',
          placeholder: '示例（选填）',
          value: field.example || '',
          onChange: (event) => onChange(index, 'example', event.target.value)
        }),
        h('label', { className: 'sti-field-required' },
          h('input', {
            type: 'checkbox',
            checked: Boolean(field.required),
            onChange: (event) => onChange(index, 'required', event.target.checked)
          }),
          '必填'
        ),
        h('button', { className: 'sti-btn sti-btn-ghost sti-field-remove', onClick: () => onRemove(index) }, '删除')
      )
    }

    function renderFieldsEditor(fields, setFields) {
      return h(
        'div',
        { className: 'sti-fields-editor' },
        h('div', { className: 'sti-field-head' },
          h('span', { className: 'sti-field-head-name' }, '字段名'),
          h('span', { className: 'sti-field-head-desc' }, '说明'),
          h('span', { className: 'sti-field-head-example' }, '示例'),
          h('span', { className: 'sti-field-head-required' }, '必填'),
          h('span', null)
        ),
        (fields || []).map(function (field, index) {
          return fieldRow(field, index, function (rowIndex, key, value) {
            setFields(
              fields.map(function (item, itemIndex) {
                return itemIndex === rowIndex ? Object.assign({}, item, { [key]: value }) : item
              })
            )
          }, function (rowIndex) {
            setFields(fields.filter(function (_item, itemIndex) {
              return itemIndex !== rowIndex
            }))
          })
        }),
        h(
          'button',
          {
            className: 'sti-btn sti-btn-ghost',
            onClick: () => setFields((fields || []).concat([{ name: '', description: '', example: '', required: false }]))
          },
          '+ 添加字段'
        )
      )
    }

    function renderToolbar() {
      if (!selected) return null
      const editable = selected.status === 'pending_confirmation' || selected.status === 'needs_supplement'
      const actions = []
      if (editable) {
        actions.push(h('button', { key: 'save', className: 'sti-btn sti-btn-primary', disabled: busy, onClick: () => submitDetailAction('update_task') }, '保存修改'))
        actions.push(h('button', { key: 'needs_supplement', className: 'sti-btn sti-btn-ghost', disabled: busy, onClick: () => openDialog('needs_supplement') }, '补充完善'))
        actions.push(h('button', { key: 'reject', className: 'sti-btn sti-btn-danger-ghost', disabled: busy, onClick: () => openDialog('reject') }, '驳回关闭'))
        actions.push(h('button', { key: 'confirm', className: 'sti-btn sti-btn-primary', disabled: busy, onClick: () => submitDetailAction('confirm_task') }, '确认受理'))
      } else if (selected.status === 'confirmed') {
        actions.push(h('button', { key: 'start', className: 'sti-btn sti-btn-primary', disabled: busy, onClick: () => submitDetailAction('start_processing') }, '开始采集'))
      } else if (selected.status === 'in_progress') {
        actions.push(h('button', { key: 'complete', className: 'sti-btn sti-btn-primary', disabled: busy, onClick: () => openDialog('complete') }, '标记完成'))
      }
      return h('div', { className: 'sti-detail-toolbar' }, actions)
    }

    function renderDetail() {
      const editable = selected.status === 'pending_confirmation' || selected.status === 'needs_supplement'
      const hasSupplementDraft = Boolean(selected.aiSupplementDraft)
      return h(
        'div',
        { className: 'sti-review-right' },
        h('div', { className: 'sti-detail' },
          h('div', { className: 'sti-detail-header' },
            h('div', { className: 'sti-detail-title-row' },
              h('h3', { className: 'sti-detail-title' }, selected.title || '采集需求'),
              h('span', { className: 'sti-badge', style: { borderColor: STATUS_COLORS[selected.status], color: STATUS_COLORS[selected.status] } }, STATUS_LABELS[selected.status] || selected.status),
              selected.priority ? h('span', { className: 'sti-priority-badge' }, PRIORITY_LABELS[selected.priority] || selected.priority) : null
            ),
            h('div', { className: 'sti-detail-sub' },
              h('span', null, selected.taskNo),
              selected.requesterName ? h('span', null, '需求人：' + selected.requesterName) : null,
              selected.aiConfidence != null ? h('span', null, 'AI 置信度：' + Math.round(selected.aiConfidence * 100) + '%') : null,
              selected.createdAt ? h('span', null, '创建于 ' + formatTime(selected.createdAt)) : null
            )
          ),
          renderToolbar(),
          hasSupplementDraft
            ? h(
                'div',
                { className: 'sti-draft-banner' },
                h('span', null, 'AI 已生成补充草稿'),
                h(
                  'button',
                  { className: 'sti-btn sti-btn-ghost', onClick: () => applySupplementDraft(selected.aiSupplementDraft) },
                  '一键填入'
                )
              )
            : null,
          selected.completenessTips && selected.completenessTips.length
            ? h('div', { className: 'sti-tips-block' },
                h('div', { className: 'sti-tips-title' }, '待确认 / 待补充'),
                selected.completenessTips.map(function (tip, index) {
                  return h('div', { key: index, className: 'sti-tip-item' }, '• ' + tip)
                })
              )
            : null,
          h('section', { className: 'sti-section' },
            h('div', { className: 'sti-section-header' }, h('h4', null, '原始需求')),
            h('div', { className: 'sti-divider' }),
            h('div', { className: 'sti-section-body' }, h('div', { className: 'sti-original-content' }, selected.originalContent))
          ),
          h('section', { className: 'sti-section' },
            h('div', { className: 'sti-section-header' }, h('h4', null, 'AI 提取的任务书')),
            h('div', { className: 'sti-divider' }),
            h('div', { className: 'sti-section-body' },
              editable
                ? h(
                    'div',
                    { className: 'sti-form-grid' },
                    formInput('任务标题', 'title', ''),
                    formInput('目标站点', 'targetSite', ''),
                    formInput('目标链接', 'targetUrl', ''),
                    formSelect('页面范围', 'pagesScope', PAGES_SCOPE_LABELS),
                    formSelect('采集频率', 'crawlFrequency', FREQUENCY_LABELS),
                    formSelect('交付格式', 'deliveryFormat', FORMAT_LABELS),
                    formInput('预估数据量', 'estimatedVolume', ''),
                    formSelect('优先级', 'priority', PRIORITY_LABELS),
                    h('label', { className: 'sti-form-check', key: 'authRequired' },
                      h('input', {
                        type: 'checkbox',
                        checked: Boolean(detailForm.authRequired),
                        onChange: (event) => setDetailForm(Object.assign({}, detailForm, { authRequired: event.target.checked }))
                      }),
                      ' 需要登录态'
                    ),
                    h('div', { className: 'sti-form-span-2', key: 'fields' },
                      h('div', { className: 'sti-form-label' }, '采集字段'),
                      renderFieldsEditor(detailForm.dataFields || [], function (nextFields) {
                        setDetailForm(Object.assign({}, detailForm, { dataFields: nextFields }))
                      })
                    ),
                    h('div', { className: 'sti-form-span-2', key: 'antiBotNotes' },
                      h('div', { className: 'sti-form-label' }, '反爬风险提示'),
                      h('textarea', {
                        className: 'sti-textarea',
                        rows: 2,
                        value: detailForm.antiBotNotes || '',
                        onChange: (event) => setDetailForm(Object.assign({}, detailForm, { antiBotNotes: event.target.value }))
                      })
                    ),
                    h('div', { className: 'sti-form-span-2', key: 'complianceNotes' },
                      h('div', { className: 'sti-form-label' }, '合规提示'),
                      h('textarea', {
                        className: 'sti-textarea',
                        rows: 2,
                        value: detailForm.complianceNotes || '',
                        onChange: (event) => setDetailForm(Object.assign({}, detailForm, { complianceNotes: event.target.value }))
                      })
                    )
                  )
                : h(
                    'div',
                    { className: 'sti-detail-grid' },
                    detailRow('目标站点', selected.targetSite),
                    detailRow('目标链接', selected.targetUrl),
                    detailRow('页面范围', PAGES_SCOPE_LABELS[selected.pagesScope]),
                    detailRow('采集频率', FREQUENCY_LABELS[selected.crawlFrequency]),
                    detailRow('交付格式', FORMAT_LABELS[selected.deliveryFormat]),
                    detailRow('预估数据量', selected.estimatedVolume),
                    detailRow('需要登录态', selected.authRequired ? '是' : '否'),
                    detailRow('优先级', PRIORITY_LABELS[selected.priority]),
                    selected.dataFields && selected.dataFields.length
                      ? h('div', { className: 'sti-detail-fields', key: 'fields' },
                          h('div', { className: 'sti-form-label' }, '采集字段'),
                          h(
                            'table',
                            { className: 'sti-fields-table' },
                            h('thead', null, h('tr', null, h('th', null, '字段'), h('th', null, '说明'), h('th', null, '示例'), h('th', null, '必填'))),
                            h('tbody', null, selected.dataFields.map(function (field, index) {
                              return h('tr', { key: index },
                                h('td', null, field.name),
                                h('td', null, field.description || '—'),
                                h('td', null, field.example || '—'),
                                h('td', null, field.required ? '是' : '否')
                              )
                            }))
                          )
                        )
                      : null,
                    selected.antiBotNotes ? h('div', { className: 'sti-warning-block', key: 'antiBot' }, h('div', { className: 'sti-warning-title' }, '反爬风险'), selected.antiBotNotes) : null,
                    selected.complianceNotes ? h('div', { className: 'sti-warning-block sti-warning-soft', key: 'compliance' }, h('div', { className: 'sti-warning-title' }, '合规提示'), selected.complianceNotes) : null
                  )
            )
          ),
          selected.confirmed && selected.confirmed.confirmedAt
            ? h('section', { className: 'sti-section' },
                h('div', { className: 'sti-section-header' }, h('h4', null, '人工确认信息')),
                h('div', { className: 'sti-divider' }),
                h('div', { className: 'sti-section-body' },
                  h('div', { className: 'sti-detail-grid' },
                    detailRow('确认标题', selected.confirmed.title),
                    detailRow('确认站点', selected.confirmed.targetSite),
                    detailRow('确认链接', selected.confirmed.targetUrl),
                    detailRow('确认频率', FREQUENCY_LABELS[selected.confirmed.crawlFrequency]),
                    detailRow('确认格式', FORMAT_LABELS[selected.confirmed.deliveryFormat]),
                    detailRow('受理人', selected.confirmed.assigneeName),
                    detailRow('确认时间', formatTime(selected.confirmed.confirmedAt))
                  )
                )
              )
            : null,
          selected.rejectionReason
            ? h('section', { className: 'sti-section' },
                h('div', { className: 'sti-section-header' }, h('h4', null, '驳回原因')),
                h('div', { className: 'sti-divider' }),
                h('div', { className: 'sti-section-body' }, selected.rejectionReason)
              )
            : null,
          selected.completedSummary
            ? h('section', { className: 'sti-section' },
                h('div', { className: 'sti-section-header' }, h('h4', null, '完成说明')),
                h('div', { className: 'sti-divider' }),
                h('div', { className: 'sti-section-body' }, selected.completedSummary)
              )
            : null,
          selected.logs && selected.logs.length
            ? h('section', { className: 'sti-section' },
                h('div', { className: 'sti-section-header' }, h('h4', null, '操作记录')),
                h('div', { className: 'sti-divider' }),
                h('div', { className: 'sti-section-body' },
                  selected.logs.map(function (log, index) {
                    return h('div', { key: index, className: 'sti-log-row' },
                      h('span', { className: 'sti-log-time' }, formatTime(log.createdAt)),
                      h('span', { className: 'sti-log-action' }, LOG_ACTION_LABELS[log.action] || log.action),
                      log.detail && (log.detail.remark || log.detail.reason) ? h('span', { className: 'sti-log-note' }, String(log.detail.remark || log.detail.reason)) : null
                    )
                  })
                )
              )
            : null
        )
      )
    }

    function formInput(label, key, placeholder) {
      return h('div', { className: 'sti-form-field', key: key },
        h('div', { className: 'sti-form-label' }, label),
        h('input', {
          className: 'sti-input',
          placeholder: placeholder,
          value: detailForm[key] || '',
          onChange: (event) => setDetailForm(Object.assign({}, detailForm, { [key]: event.target.value }))
        })
      )
    }

    function formSelect(label, key, labels) {
      return h('div', { className: 'sti-form-field', key: key },
        h('div', { className: 'sti-form-label' }, label),
        h('select', {
          className: 'sti-select',
          value: detailForm[key] || '',
          onChange: (event) => setDetailForm(Object.assign({}, detailForm, { [key]: event.target.value }))
        },
          h('option', { value: '' }, '—'),
          Object.keys(labels).map(function (itemKey) {
            return h('option', { key: itemKey, value: itemKey }, labels[itemKey])
          })
        )
      )
    }

    function detailRow(label, value) {
      if (value == null || value === '') return null
      return h('div', { className: 'sti-detail-row', key: label },
        h('span', { className: 'sti-detail-label' }, label),
        h('span', { className: 'sti-detail-value' }, String(value))
      )
    }

    function renderDialog() {
      if (!dialog) return null
      let title = ''
      let body = null
      let confirmAction = null
      if (dialog.kind === 'reject') {
        title = '驳回关闭任务'
        body = h('textarea', {
          className: 'sti-textarea',
          rows: 3,
          placeholder: '请说明驳回原因（如：目标站点不符合合规要求）',
          value: dialog.reason || '',
          onChange: (event) => setDialog(Object.assign({}, dialog, { reason: event.target.value }))
        })
        confirmAction = () => runAction('reject_and_close', { reason: dialog.reason }).then(function (ok) {
          if (ok) {
            loadData({})
            setDialog(null)
          }
        })
      } else if (dialog.kind === 'needs_supplement') {
        title = '标记为待补充'
        body = h('textarea', {
          className: 'sti-textarea',
          rows: 3,
          placeholder: '请说明需要补充的内容',
          value: dialog.reason || '',
          onChange: (event) => setDialog(Object.assign({}, dialog, { reason: event.target.value }))
        })
        confirmAction = () => runAction('mark_needs_supplement', { reason: dialog.reason }).then(function (ok) {
          if (ok) {
            loadData({})
            setDialog(null)
          }
        })
      } else if (dialog.kind === 'complete') {
        title = '标记完成'
        body = h('textarea', {
          className: 'sti-textarea',
          rows: 3,
          placeholder: '完成说明（如：已采集 98 条商品数据并导出 Excel）',
          value: dialog.summary || '',
          onChange: (event) => setDialog(Object.assign({}, dialog, { summary: event.target.value }))
        })
        confirmAction = () => runAction('complete_task', { completedSummary: dialog.summary }).then(function (ok) {
          if (ok) {
            loadData({})
            setDialog(null)
          }
        })
      } else if (dialog.kind === 'supplement') {
        title = '生成补充草稿'
        body = h('textarea', {
          className: 'sti-textarea',
          rows: 4,
          placeholder: '输入补充说明，将按当前内容保存补充草稿',
          value: dialog.content || '',
          onChange: (event) => setDialog(Object.assign({}, dialog, { content: event.target.value }))
        })
        confirmAction = () => submitDetailAction('prepare_supplement_draft')
      }
      return h('div', { className: 'sti-dialog-mask' },
        h('div', { className: 'sti-dialog' },
          h('div', { className: 'sti-dialog-title' }, title),
          h('div', { className: 'sti-dialog-body' }, body),
          h('div', { className: 'sti-dialog-actions' },
            h('button', { className: 'sti-btn sti-btn-ghost', onClick: () => setDialog(null) }, '取消'),
            h('button', { className: 'sti-btn sti-btn-primary', disabled: busy, onClick: confirmAction }, '确定')
          )
        )
      )
    }

    return h(
      'main',
      { className: 'sti-shell' },
      renderHeader(),
      renderNotice(),
      tab === 'report' ? renderReportEntry() : renderReviewDesk(),
      renderDialog(),
      injectStyles()
    )
  }

  function formatTime(value) {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const pad = (num) => String(num).padStart(2, '0')
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes())
  }

  function injectStyles() {
    return h(
      'style',
      null,
      [
        '.sti-shell{display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;font-size:13px;color:#1f2937;background:transparent;}',
        '.sti-system-header{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid var(--xui-color-border,#e5e7eb);flex-shrink:0;}',
        '.sti-header-title{font-weight:600;font-size:15px;white-space:nowrap;}',
        '.sti-header-tabs{display:flex;gap:4px;flex:1;}',
        '.sti-tab{background:transparent;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:13px;color:#4b5563;}',
        '.sti-tab:hover{background:rgba(0,0,0,0.04);}',
        '.sti-tab-active{background:#0f766e;color:#fff;}',
        '.sti-tab-active:hover{background:#0f766e;}',
        '.sti-tab-count{margin-left:6px;font-size:11px;opacity:0.85;}',
        '.sti-header-actions{margin-left:auto;}',
        '.sti-content{flex:1;overflow:auto;padding:16px;}',
        '.sti-report-content{display:flex;flex-direction:column;gap:16px;max-width:960px;margin:0 auto;width:100%;}',
        '.sti-review-content{display:flex;gap:16px;align-items:stretch;padding:16px;}',
        '.sti-review-left{width:340px;min-width:280px;display:flex;flex-direction:column;gap:10px;flex-shrink:0;}',
        '.sti-review-right{flex:1;min-width:0;overflow:auto;background:rgba(255,255,255,0.6);border:1px solid var(--xui-color-border,#e5e7eb);border-radius:8px;padding:16px;}',
        '.sti-filter-bar{display:flex;flex-direction:column;gap:8px;}',
        '.sti-task-list{display:flex;flex-direction:column;gap:8px;overflow:auto;}',
        '.sti-task-row{display:flex;flex-direction:column;gap:4px;text-align:left;background:rgba(255,255,255,0.6);border:1px solid var(--xui-color-border,#e5e7eb);border-radius:8px;padding:10px 12px;cursor:pointer;width:100%;font-size:12px;color:#374151;}',
        '.sti-task-row:hover{border-color:#0f766e;}',
        '.sti-task-row-active{border-color:#0f766e;box-shadow:0 0 0 1px #0f766e;}',
        '.sti-task-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px;}',
        '.sti-task-no{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:#6b7280;}',
        '.sti-task-title{font-weight:600;color:#111827;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.sti-task-meta{display:flex;gap:8px;color:#6b7280;flex-wrap:wrap;}',
        '.sti-task-site{color:#0f766e;}',
        '.sti-task-tip{color:#d97706;}',
        '.sti-badge{display:inline-block;border:1px solid;border-radius:999px;padding:1px 8px;font-size:11px;white-space:nowrap;}',
        '.sti-priority-badge{display:inline-block;background:#f3f4f6;border-radius:999px;padding:1px 8px;font-size:11px;color:#374151;}',
        '.sti-section{display:flex;flex-direction:column;background:rgba(255,255,255,0.6);border:1px solid var(--xui-color-border,#e5e7eb);border-radius:8px;overflow:hidden;}',
        '.sti-section-header{padding:10px 16px 0;}',
        '.sti-section-header h3{margin:0;font-size:14px;}',
        '.sti-section-header h4{margin:0;font-size:13px;}',
        '.sti-divider{margin:10px 16px 0;border-top:1px solid var(--xui-color-border,#e5e7eb);}',
        '.sti-section-body{padding:12px 16px 16px;display:flex;flex-direction:column;gap:10px;}',
        '.sti-textarea{width:100%;box-sizing:border-box;border:1px solid var(--xui-color-border,#d1d5db);border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;background:var(--xui-color-background,#fff);color:inherit;resize:vertical;}',
        '.sti-input{width:100%;box-sizing:border-box;border:1px solid var(--xui-color-border,#d1d5db);border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit;background:var(--xui-color-background,#fff);color:inherit;}',
        '.sti-select{width:100%;box-sizing:border-box;border:1px solid var(--xui-color-border,#d1d5db);border-radius:6px;padding:7px 10px;font-size:13px;font-family:inherit;background:var(--xui-color-background,#fff);color:inherit;}',
        '.sti-form-row{display:flex;gap:10px;}',
        '.sti-form-row .sti-input{flex:1;}',
        '.sti-actions{display:flex;gap:8px;align-items:center;}',
        '.sti-btn{display:inline-flex;align-items:center;gap:6px;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;border:1px solid transparent;font-family:inherit;}',
        '.sti-btn:disabled{opacity:0.5;cursor:not-allowed;}',
        '.sti-btn-primary{background:#0f766e;color:#fff;}',
        '.sti-btn-primary:hover{background:#115e59;}',
        '.sti-btn-ghost{background:transparent;border-color:var(--xui-color-border,#d1d5db);color:#374151;}',
        '.sti-btn-ghost:hover{background:rgba(0,0,0,0.04);}',
        '.sti-btn-danger-ghost{background:transparent;border-color:#fca5a5;color:#dc2626;}',
        '.sti-btn-danger-ghost:hover{background:#fef2f2;}',
        '.sti-notice{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;font-size:13px;flex-shrink:0;}',
        '.sti-notice-success{background:#ecfdf5;color:#065f46;}',
        '.sti-notice-error{background:#fef2f2;color:#991b1b;}',
        '.sti-notice-close{background:transparent;border:none;font-size:16px;cursor:pointer;color:inherit;padding:0 4px;}',
        '.sti-feedback{color:#0f766e;font-size:12px;}',
        '.sti-empty{display:flex;align-items:center;justify-content:center;color:#9ca3af;padding:40px 20px;font-size:13px;}',
        '.sti-catalog-card{border:1px solid var(--xui-color-border,#e5e7eb);border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:6px;}',
        '.sti-catalog-title{font-weight:600;}',
        '.sti-catalog-desc{color:#6b7280;font-size:12px;}',
        '.sti-catalog-fields{display:flex;flex-wrap:wrap;gap:6px;}',
        '.sti-chip{background:#f0fdfa;border:1px solid #99f6e4;color:#0f766e;border-radius:999px;padding:2px 8px;font-size:11px;}',
        '.sti-checklist{margin:0;padding-left:18px;color:#4b5563;line-height:1.9;font-size:12px;}',
        '.sti-detail{display:flex;flex-direction:column;gap:14px;}',
        '.sti-detail-header{display:flex;flex-direction:column;gap:6px;}',
        '.sti-detail-title-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
        '.sti-detail-title{margin:0;font-size:16px;}',
        '.sti-detail-sub{display:flex;gap:12px;color:#6b7280;font-size:12px;flex-wrap:wrap;}',
        '.sti-detail-toolbar{display:flex;gap:8px;flex-wrap:wrap;}',
        '.sti-draft-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:8px 12px;font-size:12px;}',
        '.sti-tips-block{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;gap:4px;font-size:12px;}',
        '.sti-tips-title{font-weight:600;}',
        '.sti-original-content{white-space:pre-wrap;color:#374151;line-height:1.7;}',
        '.sti-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;}',
        '.sti-form-field{display:flex;flex-direction:column;gap:4px;}',
        '.sti-form-span-2{grid-column:span 2;}',
        '.sti-form-label{font-size:12px;color:#6b7280;font-weight:600;}',
        '.sti-form-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;align-self:end;padding-bottom:7px;}',
        '.sti-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px;}',
        '.sti-detail-row{display:flex;flex-direction:column;gap:2px;font-size:12px;}',
        '.sti-detail-label{color:#6b7280;}',
        '.sti-detail-value{color:#111827;word-break:break-all;}',
        '.sti-detail-fields{display:flex;flex-direction:column;gap:6px;grid-column:span 2;}',
        '.sti-fields-table{width:100%;border-collapse:collapse;font-size:12px;}',
        '.sti-fields-table th,.sti-fields-table td{border:1px solid var(--xui-color-border,#e5e7eb);padding:6px 8px;text-align:left;}',
        '.sti-fields-table th{background:#f9fafb;color:#6b7280;font-weight:600;}',
        '.sti-fields-editor{display:flex;flex-direction:column;gap:6px;}',
        '.sti-field-row,.sti-field-head{display:flex;gap:6px;align-items:center;}',
        '.sti-field-head{font-size:11px;color:#9ca3af;font-weight:600;}',
        '.sti-field-head-name,.sti-field-name{width:120px;min-width:120px;flex-shrink:0;}',
        '.sti-field-head-desc,.sti-field-desc{flex:1.2;}',
        '.sti-field-head-example,.sti-field-example{flex:1;}',
        '.sti-field-head-required{width:48px;flex-shrink:0;}',
        '.sti-field-required{display:flex;align-items:center;gap:4px;width:64px;flex-shrink:0;font-size:12px;color:#374151;}',
        '.sti-field-remove{flex-shrink:0;padding:6px 8px;font-size:12px;}',
        '.sti-warning-block{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;color:#9a3412;font-size:12px;white-space:pre-wrap;grid-column:span 2;}',
        '.sti-warning-soft{background:#f0fdfa;border-color:#99f6e4;color:#115e59;}',
        '.sti-warning-title{font-weight:600;margin-bottom:4px;}',
        '.sti-log-row{display:flex;gap:10px;font-size:12px;align-items:baseline;}',
        '.sti-log-time{font-family:ui-monospace,Consolas,monospace;color:#9ca3af;white-space:nowrap;}',
        '.sti-log-action{color:#374151;font-weight:600;white-space:nowrap;}',
        '.sti-log-note{color:#6b7280;overflow:hidden;text-overflow:ellipsis;}',
        '.sti-dialog-mask{position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:50;}',
        '.sti-dialog{background:#fff;border-radius:10px;padding:18px;width:440px;max-width:92%;display:flex;flex-direction:column;gap:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);}',
        '.sti-dialog-title{font-weight:600;font-size:14px;}',
        '.sti-dialog-actions{display:flex;justify-content:flex-end;gap:8px;}',
        '@media (max-width:760px){.sti-review-content{flex-direction:column;}.sti-review-left{width:100%;}.sti-form-grid,.sti-detail-grid{grid-template-columns:1fr;}.sti-form-span-2,.sti-warning-block{grid-column:span 1;}}'
      ].join('\n')
    )
  }

  const rootElement = document.getElementById('root')
  ReactDOM.createRoot ? ReactDOM.createRoot(rootElement).render(h(App)) : ReactDOM.render(h(App), rootElement)
})()
