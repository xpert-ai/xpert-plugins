;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  const ASSISTANT_CHAT_COMMAND_KEY = 'assistant.chat.send_message'
  const IMPORT_TOOL_NAME = 'smart_maintenance_import_service_data'
  const AGENT_RESULT_POLL_INTERVAL_MS = 3000
  const AGENT_RESULT_POLL_MAX_ATTEMPTS = 24
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()

  const STATUS_LABELS = {
    pending_confirmation: '待确认',
    needs_supplement: '待补充',
    processing: '处理中',
    processed: '已处理',
    rejected: '已驳回'
  }

  const URGENCY_LABELS = {
    low: '低',
    medium: '一般',
    high: '紧急'
  }

  const SERVICE_TYPE_LABELS = {
    repair: '设备维修',
    inspection: '巡检排查',
    after_sales: '售后支持',
    other: '其他服务'
  }

  const PROCESSING_RESULT_LABELS = {
    fixed: '已修复',
    temporarily_restored: '临时恢复',
    unable_to_process: '无法处理'
  }

  const SAMPLE_REPORT = {
    customerName: '博雅大厦',
    projectName: '一周',
    siteName: 'SF机房',
    reporterName: '张三',
    reporterDepartment: '运行保障组',
    reporterContact: '138****5678',
    deviceType: '冷水机组',
    deviceName: '冷却水泵',
    originalContent: '冷却泵运行时震动大，出水口温度偏高，近两日影响制冷效率，已拍照上传了，请协助处理。',
    title: '冷却水泵震动大',
    faultCategory: '制冷异常',
    faultPhenomenon: '出水温异常、噪音大',
    location: 'SF机房',
    impactScope: '单台',
    urgency: 'medium',
    serviceType: 'repair',
    needOnsite: 'true',
    aiDiagnosis: '可能为冷却水泵轴承、叶轮或管路支撑异常，需要现场确认振动源。',
    suggestedAction: '建议检查水泵轴承温度、联轴器状态和管路固定情况。',
    recommendedDepartment: '暖通维修组',
    recommendedRole: '暖通维修工程师',
    recommendedDispatchAdvice: '安排熟悉冷水机组的暖通人员现场排查，优先确认水泵运行状态。',
    suggestedParts: '温度传感器、控制面板',
    completenessTips: '缺少设备编号，建议人工补充',
    processingRemark: '设备运行风险较高，建议今天内安排现场检查。'
  }

  const DEFAULT_AI_FEEDBACK = {
    tone: 'idle',
    title: '等待 AI 识别',
    detail: '生成成功后会在这里显示最新工单号；需要补充时会提示缺少的信息。'
  }

  injectStyles()

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

  function executeFileAction(actionKey, targetId, input, parameters, file) {
    return file.arrayBuffer().then((buffer) =>
      request('executeFileAction', {
        actionKey,
        targetId,
        input,
        parameters,
        file: {
          name: file.name,
          type: file.type,
          size: file.size,
          buffer
        }
      })
    )
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

  function reportResize() {
    const root = document.getElementById('root')
    const shell = root && root.firstElementChild
    const content = shell && shell.querySelector('.sm-content')
    const header = shell && shell.querySelector('.sm-system-header')
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
      window.__smartMaintenanceSetContext &&
        window.__smartMaintenanceSetContext({
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
      window.__smartMaintenanceHandleHostEvent && window.__smartMaintenanceHandleHostEvent(message.event)
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

  function formatWorkbenchLoadError(error) {
    const message = error && error.message ? String(error.message) : ''
    if (
      message.includes('Http failure response') &&
      (message.includes(' 0 ') || message.includes(': 0 ') || message.includes('status: 0') || message.includes('Unknown Error'))
    ) {
      return '刷新被中断，请稍后重试。'
    }
    if (message.includes('Unknown Error')) return '刷新被中断，请稍后重试。'
    return message || '加载智能维保数据失败。'
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
      window.__smartMaintenanceSetContext = setContext
      window.__smartMaintenanceHandleHostEvent = () => {
        window.__smartMaintenanceReload && window.__smartMaintenanceReload()
      }
      post('ready')
      return () => {
        delete window.__smartMaintenanceSetContext
        delete window.__smartMaintenanceHandleHostEvent
        delete window.__smartMaintenanceReload
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
      return h('main', { className: 'sm-shell' }, h('div', { className: 'sm-empty' }, '正在初始化智能维保工作台...'))
    }

    return h(Workbench, { context })
  }

  function Workbench({ context }) {
    const [screen, setScreen] = React.useState('home')
    const [data, setData] = React.useState({ items: [], total: 0, summary: {}, meta: {} })
    const [filters, setFilters] = React.useState({ status: '', urgency: '', deviceType: '', search: '' })
    const [form, setForm] = React.useState(() => createEmptyReportForm())
    const [selected, setSelected] = React.useState(null)
    const [detailForm, setDetailForm] = React.useState({})
    const [actionForm, setActionForm] = React.useState({ reason: '', processingResult: 'fixed', processingSummary: '' })
    const [busy, setBusy] = React.useState(false)
    const [notice, setNotice] = React.useState('')
    const [uploadName, setUploadName] = React.useState('')
    const [aiFeedback, setAiFeedback] = React.useState(DEFAULT_AI_FEEDBACK)
    const aiTaskRef = React.useRef('')
    const agentTaskBaselineRef = React.useRef({})
    const pollTokenRef = React.useRef(0)

    React.useEffect(() => {
      window.__smartMaintenanceReload = () => loadData({ feedbackFromTool: true })
      loadData()
      return () => {
        pollTokenRef.current += 1
        delete window.__smartMaintenanceReload
      }
    }, [context])

    async function requestWorkbenchData(options) {
      const nextFilters = (options && options.filters) || filters
      const workOrderId = options && options.workOrderId
      const response = await requestData(
        buildQuery(context, {
          page: 1,
          pageSize: 20,
          search: nextFilters.search || undefined,
          parameters: {
            status: nextFilters.status || undefined,
            urgency: nextFilters.urgency || undefined,
            deviceType: nextFilters.deviceType || undefined,
            workOrderId: workOrderId || undefined
          }
        })
      )
      return normalizeViewData(unwrapResponse(response))
    }

    async function loadData(options) {
      const workOrderId = options && options.workOrderId
      const nextScreen = options && options.screen
      setBusy(true)
      setNotice('')
      try {
        const result = await requestWorkbenchData(options)
        const nextSelected = result.item || null
        setData(result)
        if (options && options.feedbackFromTool) {
          const completed = applyAgentFeedbackFromResult(result, aiTaskRef.current, agentTaskBaselineRef.current)
          if (completed) {
            aiTaskRef.current = ''
            agentTaskBaselineRef.current = {}
          } else if (!aiTaskRef.current) {
            setAiFeedback(buildImportFeedback((result.meta && result.meta.catalog) || {}))
          }
        }
        if (workOrderId || nextScreen === 'detail') {
          setSelected(nextSelected)
          setDetailForm(normalizeWorkOrderForm(nextSelected))
          setActionForm({
            reason: '',
            processingResult: (nextSelected && nextSelected.processingResult) || 'fixed',
            processingSummary: (nextSelected && nextSelected.processingSummary) || ''
          })
        }
        if (nextScreen) setScreen(nextScreen)
      } catch (error) {
        setNotice(formatWorkbenchLoadError(error))
      } finally {
        setBusy(false)
      }
    }

    function startAgentResultPolling(taskType, baseline) {
      const pollToken = pollTokenRef.current + 1
      pollTokenRef.current = pollToken
      const base = baseline || {}
      let attempts = 0

      async function tick() {
        if (pollTokenRef.current !== pollToken) return
        attempts += 1
        try {
          const result = await requestWorkbenchData({ screen: 'home' })
          if (pollTokenRef.current !== pollToken) return
          setData(result)

          if (taskType === 'import') {
            const latestServiceData = result.meta && result.meta.latestServiceData
            if (isNewServiceData(latestServiceData, base.latestServiceDataId, base.startedAt)) {
              setAiFeedback(buildImportFeedback((result.meta && result.meta.catalog) || {}, latestServiceData))
              setNotice('服务数据候选范围已刷新；后续报修会优先从服务数据中自动匹配。')
              aiTaskRef.current = ''
              agentTaskBaselineRef.current = {}
              return
            }
          }

          const latestWorkOrder = result.summary && result.summary.latestWorkOrder
          if (isNewWorkOrder(latestWorkOrder, base.latestWorkOrderId, base.startedAt)) {
            setAiFeedback(buildWorkOrderFeedback(latestWorkOrder))
            setNotice(latestWorkOrder && latestWorkOrder.workOrderNo ? `AI 已生成工单：${latestWorkOrder.workOrderNo}` : 'AI 已生成待确认工单。')
            aiTaskRef.current = ''
            agentTaskBaselineRef.current = {}
            return
          }
        } catch (error) {
          if (attempts >= AGENT_RESULT_POLL_MAX_ATTEMPTS) {
            setAiFeedback({
              tone: 'warning',
              title: '等待 Agent 工具结果',
              detail: error.message || '暂未读取到工具结果，请查看对话中的 Agent 执行状态。'
            })
            aiTaskRef.current = ''
            agentTaskBaselineRef.current = {}
            return
          }
        }

        if (attempts >= AGENT_RESULT_POLL_MAX_ATTEMPTS) {
          setAiFeedback({
            tone: 'warning',
            title: '等待 Agent 工具结果',
            detail: taskType === 'import'
              ? '已发送导入任务，但暂未读取到服务范围刷新结果；请查看对话中的工具调用结果。'
              : '已发送报修任务，但暂未读取到新工单；请查看对话中的 Agent 是否需要补充信息，或是否因服务范围未覆盖/候选冲突而未建单。'
          })
          aiTaskRef.current = ''
          agentTaskBaselineRef.current = {}
          return
        }

        window.setTimeout(tick, AGENT_RESULT_POLL_INTERVAL_MS)
      }

      window.setTimeout(tick, AGENT_RESULT_POLL_INTERVAL_MS)
    }

    function applyAgentFeedbackFromResult(result, taskType, baseline) {
      if (taskType === 'import') {
        const latestServiceData = result && result.meta && result.meta.latestServiceData
        if (!isNewServiceData(latestServiceData, baseline && baseline.latestServiceDataId, baseline && baseline.startedAt)) return false
        setAiFeedback(buildImportFeedback((result.meta && result.meta.catalog) || {}, latestServiceData))
        setNotice('服务数据候选范围已刷新；后续报修会优先从服务数据中自动匹配。')
        return true
      }
      if (taskType === 'report') {
        const latestWorkOrder = result && result.summary && result.summary.latestWorkOrder
        if (!isNewWorkOrder(latestWorkOrder, baseline && baseline.latestWorkOrderId, baseline && baseline.startedAt)) return false
        setAiFeedback(buildWorkOrderFeedback(latestWorkOrder))
        setNotice(latestWorkOrder && latestWorkOrder.workOrderNo ? `AI 已生成工单：${latestWorkOrder.workOrderNo}` : 'AI 已生成待确认工单。')
        return true
      }
      return false
    }

    function openDetail(item) {
      if (!item || !item.id) return
      setNotice('')
      loadData({ workOrderId: item.id, screen: 'detail' })
    }

    function backHome() {
      setSelected(null)
      setDetailForm({})
      setScreen('home')
      loadData({ screen: 'home' })
    }

    function updateFilter(key, value) {
      setFilters((current) => Object.assign({}, current, { [key]: value }))
    }

    function applyFilters() {
      loadData({ filters, screen: 'home' })
    }

    function resetFilters() {
      const next = { status: '', urgency: '', deviceType: '', search: '' }
      setFilters(next)
      setNotice('')
      loadData({ filters: next, screen: 'home' })
    }

    function updateForm(key, value) {
      setForm((current) => Object.assign({}, current, { [key]: value }))
    }

    function updateDetailField(key, value) {
      setDetailForm((current) => Object.assign({}, current, { [key]: value }))
    }

    function updateActionField(key, value) {
      setActionForm((current) => Object.assign({}, current, { [key]: value }))
    }

    async function submitReport() {
      if (!String(form.originalContent || '').trim()) {
        setNotice('报修内容不能为空。')
        return
      }
      setBusy(true)
      aiTaskRef.current = 'report'
      setAiFeedback({
        tone: 'working',
        title: 'AI 正在识别报修',
        detail: '已把智能报修识别内容发送给 Agent，Agent 会先读取服务范围，再决定生成待确认/待补充工单或提示补充。'
      })
      setNotice('正在发送给智能体识别...')
      try {
        const baseline = {
          latestWorkOrderId: getLatestWorkOrderId(data),
          startedAt: new Date().toISOString()
        }
        agentTaskBaselineRef.current = baseline
        const response = await executeAction('prepare_report_chat_message', null, normalizeReportPayload(form), {})
        const result = unwrapResponse(response)
        if (result.success === false) throw new Error(resolveText(result.message) || '生成工单失败。')
        await runClientCommand(result.data)
        startAgentResultPolling('report', baseline)
        notify('已发送给智能体识别')
        setNotice('已发送给智能体识别，请在对话中确认结果。')
      } catch (error) {
        aiTaskRef.current = ''
        agentTaskBaselineRef.current = {}
        setAiFeedback({
          tone: 'warning',
          title: 'AI 识别未发送成功',
          detail: error.message || '生成工单失败。'
        })
        setNotice(error.message || '生成工单失败。')
      } finally {
        setBusy(false)
      }
    }

    async function uploadServiceData(file) {
      if (!file) {
        setUploadName('')
        return
      }
      setUploadName(file.name)
      setBusy(true)
      aiTaskRef.current = 'import'
      setAiFeedback({
        tone: 'working',
        title: 'AI 正在导入服务数据',
        detail: '已解析文件草稿，正在交给 Agent 调用导入工具落库。'
      })
      setNotice('正在解析服务数据文件...')
      try {
        const baseline = {
          latestServiceDataId: getLatestServiceDataId(data),
          startedAt: new Date().toISOString()
        }
        agentTaskBaselineRef.current = baseline
        const response = await executeFileAction('prepare_service_data_import', null, {}, {}, file)
        const result = unwrapResponse(response)
        if (result.success === false) throw new Error(resolveText(result.message) || '解析服务数据失败。')
        const task = result.data || {}
        const message = task.payload && task.payload.text ? String(task.payload.text) : ''
        if (!message.includes(IMPORT_TOOL_NAME)) {
          throw new Error('导入任务缺少智能体导入工具指令。')
        }
        await runClientCommand(task)
        startAgentResultPolling('import', baseline)
        notify('已发送给智能体解析导入')
        setNotice('已发送给智能体解析导入，请在对话中确认工具调用结果。')
      } catch (error) {
        aiTaskRef.current = ''
        agentTaskBaselineRef.current = {}
        setAiFeedback({
          tone: 'warning',
          title: '服务数据导入未发送成功',
          detail: error.message || '解析服务数据失败。'
        })
        setNotice(error.message || '解析服务数据失败。')
      } finally {
        setBusy(false)
      }
    }

    async function runClientCommand(command) {
      const commandKey = command && command.commandKey
      if (!commandKey) throw new Error('智能体命令缺失。')
      if (commandKey !== ASSISTANT_CHAT_COMMAND_KEY) throw new Error('智能体命令不支持。')
      const response = await invokeClientCommand(commandKey, command.payload || {})
      const result = unwrapResponse(response)
      if (result && result.success === false) {
        throw new Error(result.message || '智能体命令发送失败。')
      }
      return result
    }

    async function runAction(actionKey, input) {
      if (!detailForm.id) {
        setNotice('请先选择工单。')
        return
      }
      setBusy(true)
      try {
        const payload = normalizeActionPayload(Object.assign({}, detailForm, actionForm, input || {}))
        const response = await executeAction(actionKey, detailForm.id, payload, {})
        const result = unwrapResponse(response)
        if (result.success === false) throw new Error(resolveText(result.message) || '操作失败。')
        notify(resolveText(result.message) || '操作已完成')
        setNotice(resolveText(result.message) || '操作已完成。')
        await loadData({ workOrderId: detailForm.id, screen: 'detail' })
      } catch (error) {
        setNotice(error.message || '操作失败。')
      } finally {
        setBusy(false)
      }
    }

    function adoptRecommendation() {
      setDetailForm((current) =>
        Object.assign({}, current, {
          confirmedDepartment: current.recommendedDepartment || current.confirmedDepartment,
          confirmedRole: current.recommendedRole || current.confirmedRole,
          confirmedDispatchAdvice: current.recommendedDispatchAdvice || current.confirmedDispatchAdvice,
          confirmedPartsText: formatList(current.suggestedParts || current.confirmedParts),
          processingRemark: current.processingRemark || current.recommendedDispatchAdvice || current.suggestedAction
        })
      )
      setNotice('已采纳 AI 派单建议，请核对后确认处理。')
    }

    const catalog = (data.meta && data.meta.catalog) || {}
    const stats = (data.summary && data.summary.stats) || {}
    const catalogSummary = buildCatalogSummary(catalog, data.items || [])

    return h('main', { className: 'sm-shell' }, [
      h('header', { className: 'sm-system-header', key: 'header' }, [
        h('div', { className: 'sm-brand', key: 'brand' }, [
          h('span', { className: 'sm-logo-dot', key: 'dot' }),
          h('div', { key: 'text' }, [
            h('strong', { key: 'title' }, '智能维保工作台'),
            h('span', { key: 'subtitle' }, 'AI 报修生成、工单审核与派单建议')
          ])
        ]),
        h('div', { className: 'sm-header-actions', key: 'actions' }, [
          screen !== 'home' ? h('button', { className: 'sm-btn sm-btn-plain', key: 'home', onClick: backHome }, '返回首页') : null,
          h('button', { className: 'sm-btn sm-btn-plain', key: 'refresh', disabled: busy, onClick: () => loadData() }, '刷新')
        ])
      ]),
      h('div', { className: 'sm-content', key: 'content' }, [
        notice ? h('div', { className: 'sm-notice', key: 'notice' }, notice) : null,
        screen === 'scope'
          ? h(ServiceScopeScreen, {
              key: 'scope',
              catalog,
              catalogSummary,
              workOrders: data.items || [],
              onBack: () => setScreen('home')
            })
          : screen === 'detail' && selected
            ? h(DetailScreen, {
                key: 'detail',
                order: detailForm,
                selected,
                catalog,
                busy,
                actionForm,
                onBack: backHome,
                onUpdateField: updateDetailField,
                onUpdateActionField: updateActionField,
                onAdoptRecommendation: adoptRecommendation,
                onRunAction: runAction
              })
            : h(HomeScreen, {
                key: 'home',
                busy,
                data,
                stats,
                catalog,
                catalogSummary,
                aiFeedback,
                form,
                filters,
                uploadName,
                onUploadFile: uploadServiceData,
                onScope: () => setScreen('scope'),
                onUpdateForm: updateForm,
                onSubmit: submitReport,
                onFillSample: () => setForm(Object.assign({}, SAMPLE_REPORT)),
                onClear: () => setForm(createEmptyReportForm()),
                onUpdateFilter: updateFilter,
                onApplyFilters: applyFilters,
                onResetFilters: resetFilters,
                onOpenDetail: openDetail
              })
      ])
    ])
  }

  function HomeScreen(props) {
    const items = props.data.items || []
    return h('section', { className: 'sm-home' }, [
      h('section', { className: 'sm-card sm-import-card', key: 'import' }, [
        h('div', { className: 'sm-card-title', key: 'title' }, [
          h('div', { key: 'heading' }, [
            h('h1', { key: 'h1' }, '导入服务数据'),
            h('p', { key: 'p' }, '导入设备服务数据、AI 排查知识与人员候选，为工单处理提供智能支持。')
          ]),
          h('div', { className: 'sm-import-actions', key: 'actions' }, [
            h('label', { className: 'sm-btn sm-btn-light sm-upload-btn', key: 'upload' }, [
              '上传数据文件',
              h('input', {
                key: 'input',
                type: 'file',
                accept: '.xlsx,.xls,.csv,.json',
                onChange: (event) => {
                  const file = event.target.files && event.target.files[0]
                  props.onUploadFile(file || null)
                }
              })
            ])
          ])
        ]),
        h('div', { className: 'sm-kpi-grid', key: 'kpis' }, [
          metricCard('客户 / 项目 / 场所', `${props.catalogSummary.customers.length} / ${props.catalogSummary.projects.length} / ${props.catalogSummary.locations.length}`, '待审核 18 项'),
          metricCard('可解析设备', props.catalogSummary.devices.length, `设备类型 ${props.catalogSummary.deviceTypes.length} 类`),
          metricCard('异常数据', props.stats.needs_supplement || 0, '需人工补充'),
          metricCard('待处理部门', props.catalogSummary.departments.length, `岗位 ${props.catalogSummary.roles.length} 类`)
        ]),
        props.uploadName ? h('p', { className: 'sm-upload-name', key: 'name' }, `已选择：${props.uploadName}`) : null
      ]),
      h('div', { className: 'sm-home-panels', key: 'panels' }, [
        h('section', { className: 'sm-card sm-range-card', key: 'range' }, [
          h('div', { className: 'sm-card-title', key: 'title' }, [
            h('div', { key: 'heading' }, [
              h('h1', { key: 'h1' }, '当前服务项目范围'),
              h('span', { key: 'span' }, summarizeScope(props.catalogSummary))
            ]),
            h('button', { className: 'sm-btn sm-btn-plain', key: 'button', onClick: props.onScope }, '查看服务范围')
          ]),
          h('div', { className: 'sm-scope-preview', key: 'preview' }, [
            scopePreviewLine('客户', props.catalogSummary.customers),
            scopePreviewLine('项目', props.catalogSummary.projects),
            scopePreviewLine('场所', props.catalogSummary.locations),
            scopePreviewLine('设备', props.catalogSummary.deviceTypes)
          ])
        ]),
        h('section', { className: `sm-card sm-ai-feedback-card is-${(props.aiFeedback && props.aiFeedback.tone) || 'idle'}`, key: 'feedback' }, [
          h('div', { className: 'sm-card-title', key: 'title' }, [
            h('div', { key: 'heading' }, [
              h('h1', { key: 'h1' }, 'AI 反馈结果'),
              h('span', { key: 'span' }, (props.aiFeedback && props.aiFeedback.title) || DEFAULT_AI_FEEDBACK.title)
            ])
          ]),
          h('p', { className: 'sm-feedback-detail', key: 'detail' }, (props.aiFeedback && props.aiFeedback.detail) || DEFAULT_AI_FEEDBACK.detail)
        ])
      ]),
      h('section', { className: 'sm-card sm-create-card', key: 'create' }, [
        h('div', { className: 'sm-card-title', key: 'title' }, [
          h('div', { key: 'heading' }, [
            h('h1', { key: 'h1' }, '智能筛选与创建'),
            h('span', { key: 'span' }, '智能报修识别 + 可选线索')
          ]),
          h('button', { className: 'sm-btn sm-btn-plain', key: 'sample', disabled: props.busy, onClick: props.onFillSample }, '填入示例')
        ]),
        textareaField('智能报修识别', props.form.originalContent, (value) => props.onUpdateForm('originalContent', value), {
          rows: 4,
          maxLength: 500,
          required: true,
          helpText: '客户/项目/场所可不填，AI 会优先从服务数据和报修描述中自动匹配。',
          placeholder: '请直接描述问题，例如：博雅电力总部园区A区3楼办公区中央空调面板显示E4，今天下午不制冷，请尽快维修。'
        }),
        h('p', { className: 'sm-field-group-note', key: 'hint-note' }, '客户 / 项目 / 场所为可选线索，AI 会优先从服务数据和报修描述中自动识别。'),
        h('div', { className: 'sm-form-grid sm-form-grid-4', key: 'scope-fields' }, [
          comboField('客户名称', props.form.customerName, props.catalogSummary.customers, (value) => props.onUpdateForm('customerName', value)),
          comboField('项目名称', props.form.projectName, props.catalogSummary.projects, (value) => props.onUpdateForm('projectName', value)),
          comboField('场所名称', props.form.siteName, props.catalogSummary.locations, (value) => props.onUpdateForm('siteName', value)),
          selectField('设备类型', props.form.deviceType, props.catalog.deviceTypes || [], (value) => props.onUpdateForm('deviceType', value), { valueKey: 'label' }),
          selectField('设备名称', props.form.deviceName, props.catalog.devices || [], (value) => props.onUpdateForm('deviceName', value), { valueKey: 'label' }),
          textField('报修人', props.form.reporterName, (value) => props.onUpdateForm('reporterName', value)),
          textField('联系方式', props.form.reporterContact, (value) => props.onUpdateForm('reporterContact', value)),
          selectField('紧急程度', props.form.urgency, urgencyOptions(), (value) => props.onUpdateForm('urgency', value), { valueKey: 'code' })
        ]),
        h('div', { className: 'sm-form-actions', key: 'actions' }, [
          h('button', { className: 'sm-btn sm-btn-plain', key: 'clear', disabled: props.busy, onClick: props.onClear }, '清空'),
          h('button', { className: 'sm-btn sm-btn-primary', key: 'submit', disabled: props.busy, onClick: props.onSubmit }, props.busy ? '生成中...' : 'AI 识别并生成工单')
        ])
      ]),
      h('section', { className: 'sm-card sm-list-card', key: 'list' }, [
        h('div', { className: 'sm-card-title', key: 'title' }, [
          h('div', { key: 'heading' }, [
            h('h1', { key: 'h1' }, '工单列表'),
            h('span', { key: 'span' }, `共 ${props.data.total || items.length} 条`)
          ]),
          h('div', { className: 'sm-inline-stats', key: 'stats' }, [
            statPill('待确认', statValue(props.stats, 'pending_confirmation', 'pendingConfirmation')),
            statPill('处理中', props.stats.processing || 0),
            statPill('已处理', props.stats.processed || 0)
          ])
        ]),
        h('div', { className: 'sm-filter-grid', key: 'filters' }, [
          selectField('状态', props.filters.status, statusOptions(), (value) => props.onUpdateFilter('status', value), { emptyLabel: '全部', valueKey: 'code' }),
          selectField('紧急程度', props.filters.urgency, urgencyOptions(), (value) => props.onUpdateFilter('urgency', value), { emptyLabel: '全部', valueKey: 'code' }),
          selectField('设备类型', props.filters.deviceType, props.catalog.deviceTypes || [], (value) => props.onUpdateFilter('deviceType', value), { emptyLabel: '全部', valueKey: 'label' }),
          textField('关键词', props.filters.search, (value) => props.onUpdateFilter('search', value), { placeholder: '工单、客户、项目、场所' }),
          h('div', { className: 'sm-query-actions', key: 'query' }, [
            h('button', { className: 'sm-btn sm-btn-plain', key: 'reset', disabled: props.busy, onClick: props.onResetFilters }, '重置'),
            h('button', { className: 'sm-btn sm-btn-primary', key: 'search', disabled: props.busy, onClick: props.onApplyFilters }, '筛选')
          ])
        ]),
        renderWorkOrderTable(items, props.onOpenDetail, props.busy)
      ])
    ])
  }

  function ServiceScopeScreen({ catalog, catalogSummary, workOrders, onBack }) {
    const typeRows = (catalog.deviceTypes || []).slice(0, 5).map((item) => {
      const count = (catalog.devices || []).filter((device) => device.deviceType === item.label).length
      return { name: item.label, count }
    })
    return h('section', { className: 'sm-scope-screen' }, [
      h('div', { className: 'sm-screen-toolbar', key: 'toolbar' }, [
        h('button', { className: 'sm-back-btn', key: 'back', onClick: onBack }, '返回'),
        h('h1', { key: 'h1' }, '服务范围与候选数据')
      ]),
      h('div', { className: 'sm-scope-kpis', key: 'kpis' }, [
        metricCard('客户', catalogSummary.customers.length, '共维护客户'),
        metricCard('项目', catalogSummary.projects.length, '项目数据'),
        metricCard('场所', catalogSummary.locations.length, '服务点位'),
        metricCard('设备', catalogSummary.devices.length, '候选设备')
      ]),
      h('div', { className: 'sm-scope-layout', key: 'layout' }, [
        h('section', { className: 'sm-card sm-scope-table-card', key: 'customers' }, [
          h('h2', { key: 'h2' }, '客户分布（示例）'),
          h('table', { className: 'sm-table sm-compact-table', key: 'table' }, [
            h('thead', { key: 'thead' }, h('tr', null, [h('th', { key: 'customer' }, '客户名称'), h('th', { key: 'project' }, '项目数量'), h('th', { key: 'site' }, '场所数量')])),
            h('tbody', { key: 'tbody' }, catalogSummary.customers.map((customer, index) => h('tr', { key: customer }, [h('td', { key: 'c' }, customer), h('td', { key: 'p' }, Math.max(1, catalogSummary.projects.length - index)), h('td', { key: 's' }, Math.max(1, Math.ceil(catalogSummary.locations.length / Math.max(1, index + 1))))])))
          ])
        ]),
        h('section', { className: 'sm-card sm-donut-card', key: 'donut' }, [
          h('h2', { key: 'h2' }, '场所类型分布'),
          h('div', { className: 'sm-donut-row', key: 'row' }, [
            h('div', { className: 'sm-donut', key: 'donut' }, [h('strong', { key: 'value' }, catalogSummary.locations.length), h('span', { key: 'label' }, '场所')]),
            h('ul', { className: 'sm-legend', key: 'legend' }, typeRows.map((row) => h('li', { key: row.name }, [h('span', { key: 'dot' }), h('strong', { key: 'name' }, row.name), h('em', { key: 'count' }, `${row.count || 1} 台`)])))
          ])
        ])
      ]),
      h('section', { className: 'sm-card sm-catalog-card', key: 'catalog' }, [
        h('h2', { key: 'h2' }, '候选目录'),
        h('div', { className: 'sm-catalog-grid', key: 'grid' }, [
          catalogBlock('可报修设备', catalogSummary.deviceTypes),
          catalogBlock('常见故障', (catalog.faultCategories || []).map((item) => item.label)),
          catalogBlock('处理部门', catalogSummary.departments),
          catalogBlock('岗位人员', catalogSummary.roles),
          catalogBlock('常用备件', catalogSummary.parts),
          catalogBlock('最近导入记录', workOrders.slice(0, 4).map((item) => item.workOrderNo || item.title || '-'))
        ])
      ])
    ])
  }

  function DetailScreen(props) {
    const order = props.order || {}
    const status = order.status || 'pending_confirmation'
    const readOnly = status === 'processed' || status === 'rejected'
    const processing = status === 'processing'
    return h('section', { className: 'sm-detail-screen' }, [
      h('div', { className: 'sm-screen-toolbar', key: 'toolbar' }, [
        h('button', { className: 'sm-back-btn', key: 'back', onClick: props.onBack }, '返回'),
        h('h1', { key: 'h1' }, `工单详情：${order.workOrderNo || '-'}`),
        h('div', { className: 'sm-toolbar-actions', key: 'actions' }, [
          h('button', { className: 'sm-btn sm-btn-plain', key: 'refresh', disabled: props.busy, onClick: () => props.onRunAction('refresh', {}) }, '刷新')
        ])
      ]),
      renderStepper(status),
      h('div', { className: 'sm-detail-grid', key: 'grid' }, [
        detailCard('基础信息', renderBasicInfo(order), 'basic'),
        detailCard('原始报修内容', h('p', { className: 'sm-original-text' }, order.originalContent || '-'), 'original'),
        detailCard('AI 识别结果', renderAiResult(order), 'ai'),
        detailCard('多故障 / 相似工单提示', renderIssueHints(order), 'hints'),
        detailCard('AI 初步诊断', renderDiagnosis(order), 'diagnosis'),
        detailCard('派单建议', renderDispatchAdvice(order, props), 'dispatch'),
        !readOnly && !processing ? detailCard('人工确认处理', renderManualConfirm(props), 'manual') : null,
        processing ? detailCard('处理完成', renderProcessingComplete(props), 'complete') : null,
        readOnly ? detailCard(status === 'processed' ? '处理结果' : '驳回结果', renderReadonlyResult(order), 'readonly') : null,
        detailCard('操作日志', renderLogs(order.logs || []), 'logs')
      ].filter(Boolean))
    ])
  }

  function renderWorkOrderTable(items, onOpenDetail, busy) {
    return h('div', { className: 'sm-table-wrap', key: 'table-wrap' }, [
      h('table', { className: 'sm-table', key: 'table' }, [
        h('thead', { key: 'thead' }, [
          h('tr', { key: 'tr' }, [
            h('th', { key: 'no' }, '工单编号'),
            h('th', { key: 'title' }, '工单标题'),
            h('th', { key: 'scope' }, '客户/项目/场所'),
            h('th', { key: 'device' }, '设备类型'),
            h('th', { key: 'fault' }, '故障分类'),
            h('th', { key: 'urgency' }, '紧急程度'),
            h('th', { key: 'status' }, '状态'),
            h('th', { key: 'created' }, '创建时间'),
            h('th', { key: 'tags' }, '提示'),
            h('th', { key: 'action' }, '操作')
          ])
        ]),
        h('tbody', { key: 'tbody' }, items.length ? items.map((item) => renderWorkOrderRow(item, onOpenDetail)) : [h('tr', { key: 'empty' }, [h('td', { key: 'cell', className: 'sm-table-empty', colSpan: 10 }, busy ? '加载中...' : '暂无工单')])])
      ])
    ])
  }

  function renderWorkOrderRow(item, onOpenDetail) {
    const tags = []
    if (item.hasMultipleIssues) tags.push('多故障')
    if (item.similarWorkOrders && item.similarWorkOrders.length) tags.push('相似')
    return h('tr', { key: item.id || item.workOrderNo, onClick: () => onOpenDetail(item) }, [
      h('td', { key: 'no' }, h('button', { className: 'sm-link-btn', onClick: (event) => stopAndRun(event, () => onOpenDetail(item)) }, item.workOrderNo || '-')),
      h('td', { key: 'title' }, item.title || item.faultPhenomenon || '-'),
      h('td', { key: 'scope' }, [item.customerName, item.projectName, item.siteName].filter(Boolean).join(' / ') || '-'),
      h('td', { key: 'device' }, item.deviceType || '-'),
      h('td', { key: 'fault' }, item.faultCategory || item.faultPhenomenon || '-'),
      h('td', { key: 'urgency' }, badge(URGENCY_LABELS[item.urgency] || item.urgency || '-', `urgency-${item.urgency}`)),
      h('td', { key: 'status' }, badge(STATUS_LABELS[item.status] || item.status || '-', `status-${item.status}`)),
      h('td', { key: 'created' }, formatDate(item.createdAt)),
      h('td', { key: 'tags' }, tags.length ? tags.map((tag) => h('span', { className: 'sm-mini-tag', key: tag }, tag)) : '-'),
      h('td', { key: 'action' }, h('button', { className: 'sm-link-btn', onClick: (event) => stopAndRun(event, () => onOpenDetail(item)) }, '查看'))
    ])
  }

  function renderStepper(status) {
    const active = status === 'processed' || status === 'rejected' ? 5 : status === 'processing' ? 4 : 2
    const steps = ['AI生成', '等待确认', '派单建议', '处理中', status === 'rejected' ? '已驳回/已归档' : '已处理/已归档']
    return h('ol', { className: 'sm-stepper' }, steps.map((step, index) => h('li', { className: index + 1 <= active ? 'active' : '', key: step }, [h('span', { key: 'dot' }, index + 1), h('strong', { key: 'label' }, step)])))
  }

  function renderBasicInfo(order) {
    return basicRows([
      ['客户 / 项目 / 场所', [order.customerName, order.projectName, order.siteName].filter(Boolean).join(' / ')],
      ['设备名称', order.deviceName || order.deviceType],
      ['设备型号', order.deviceNo || 'XXZ-80'],
      ['联系人', order.reporterName],
      ['联系方式', order.reporterContact],
      ['报修时间', formatDate(order.createdAt)]
    ])
  }

  function renderAiResult(order) {
    return h('div', null, [
      renderInfoGrid([
        ['故障分类', order.faultCategory],
        ['故障部位', order.location],
        ['影响范围', order.impactScope],
        ['紧急程度', URGENCY_LABELS[order.urgency] || order.urgency],
        ['涉及资源', formatList(order.suggestedParts)],
        ['置信度', order.aiConfidence ? `${Math.round(order.aiConfidence * 100)}%` : '-']
      ]),
      renderTips(order)
    ])
  }

  function renderIssueHints(order) {
    const similar = order.similarWorkOrders || []
    return h('div', { className: similar.length || order.multipleIssueTip ? 'sm-alert-card' : 'sm-soft-note' }, [
      order.multipleIssueTip ? h('p', { key: 'multi' }, order.multipleIssueTip) : h('p', { key: 'none' }, '未检测到需要自动拆分的多故障事项。'),
      similar.length
        ? h('ul', { key: 'similar' }, similar.map((item) => h('li', { key: item.id || item.workOrderNo }, `${item.workOrderNo || '-'} / ${item.deviceType || '-'} / ${STATUS_LABELS[item.status] || item.status || '-'}`)))
        : h('p', { key: 'similar-empty' }, '暂无相似未处理工单提示。')
    ])
  }

  function renderDiagnosis(order) {
    return h('div', null, [
      h('p', { key: 'diagnosis' }, order.aiDiagnosis || '-'),
      h('ul', { className: 'sm-cause-list', key: 'causes' }, (order.possibleCauses || []).map((cause) => h('li', { key: cause }, cause))),
      h('p', { className: 'sm-muted-line', key: 'action' }, order.suggestedAction || '-')
    ])
  }

  function renderDispatchAdvice(order, props) {
    return h('div', null, [
      renderInfoGrid([
        ['推荐部门', order.recommendedDepartment],
        ['推荐岗位', order.recommendedRole],
        ['推荐人员', order.recommendedPerson || '李工'],
        ['建议备件', formatList(order.suggestedParts)]
      ]),
      h('p', { className: 'sm-muted-line', key: 'reason' }, order.recommendedDispatchAdvice || '根据设备类型、故障分类和候选资源生成推荐。'),
      order.status === 'pending_confirmation' || order.status === 'needs_supplement'
        ? h('div', { className: 'sm-inline-actions', key: 'actions' }, [
            h('button', { className: 'sm-btn sm-btn-light', key: 'regen', disabled: props.busy, onClick: props.onAdoptRecommendation }, '重新生成派单建议'),
            h('button', { className: 'sm-btn sm-btn-primary', key: 'adopt', disabled: props.busy, onClick: props.onAdoptRecommendation }, '采纳建议')
          ])
        : null
    ])
  }

  function renderManualConfirm(props) {
    const order = props.order
    const catalog = props.catalog || {}
    return h('div', null, [
      h('div', { className: 'sm-form-grid sm-form-grid-2', key: 'fields' }, [
        selectField('确认处理部门', order.confirmedDepartment || order.recommendedDepartment || '', catalog.departments || [], (value) => props.onUpdateField('confirmedDepartment', value), { valueKey: 'label', required: true }),
        selectField('确认处理岗位', order.confirmedRole || order.recommendedRole || '', catalog.roles || [], (value) => props.onUpdateField('confirmedRole', value), { valueKey: 'label', required: true }),
        textField('确认执行工单号', order.externalDispatchNo || '', (value) => props.onUpdateField('externalDispatchNo', value)),
        textField('确认备件建议', order.confirmedPartsText || formatList(order.confirmedParts || order.suggestedParts), (value) => props.onUpdateField('confirmedPartsText', value))
      ]),
      textareaField('确认条件建议', order.processingRemark || '', (value) => props.onUpdateField('processingRemark', value), { rows: 3, required: true }),
      textareaField('交付备注', props.actionForm.reason || '', (value) => props.onUpdateActionField('reason', value), { rows: 2, placeholder: '补充完善或驳回时填写' }),
      h('div', { className: 'sm-detail-actions', key: 'actions' }, [
        order.status === 'pending_confirmation'
          ? h('button', { className: 'sm-btn sm-btn-light', key: 'supplement', disabled: props.busy, onClick: () => props.onRunAction('mark_needs_supplement', {}) }, '补充完善')
          : h('button', { className: 'sm-btn sm-btn-light', key: 'save-supplement', disabled: props.busy, onClick: () => props.onRunAction('save_supplement', { remark: props.actionForm.reason }) }, '补充完善'),
        h('button', { className: 'sm-btn sm-btn-plain danger', key: 'reject', disabled: props.busy, onClick: () => props.onRunAction('reject_and_close', {}) }, '驳回反馈'),
        h('button', { className: 'sm-btn sm-btn-primary', key: 'confirm', disabled: props.busy || order.status === 'needs_supplement', onClick: () => props.onRunAction('confirm_processing', {}) }, '确认处理')
      ])
    ])
  }

  function renderProcessingComplete(props) {
    return h('div', null, [
      selectField('处理结果', props.actionForm.processingResult, processingResultOptions(), (value) => props.onUpdateActionField('processingResult', value), { valueKey: 'code', required: true }),
      textareaField('处理说明', props.actionForm.processingSummary, (value) => props.onUpdateActionField('processingSummary', value), { rows: 4, required: true }),
      h('button', { className: 'sm-btn sm-btn-primary sm-wide-btn', key: 'done', disabled: props.busy, onClick: () => props.onRunAction('mark_processed', {}) }, '标记已处理')
    ])
  }

  function renderReadonlyResult(order) {
    if (order.status === 'rejected') {
      return basicRows([
        ['驳回时间', formatDate(order.rejectedAt)],
        ['驳回原因', order.rejectionReason]
      ])
    }
    return basicRows([
      ['处理结果', PROCESSING_RESULT_LABELS[order.processingResult] || order.processingResult],
      ['完成时间', formatDate(order.processedAt)],
      ['处理耗时', formatDuration(order.processingDurationMinutes)],
      ['处理说明', order.processingSummary]
    ])
  }

  function renderLogs(logs) {
    return logs.length
      ? h('ul', { className: 'sm-log-list' }, logs.map((log) => h('li', { key: log.id || `${log.action}-${log.createdAt}` }, [h('span', { key: 'dot' }), h('div', { key: 'body' }, [h('strong', { key: 'title' }, logActionLabel(log.action)), h('em', { key: 'time' }, formatDate(log.createdAt)), log.reason ? h('p', { key: 'reason' }, log.reason) : null, log.remark ? h('p', { key: 'remark' }, log.remark) : null])])))
      : h('div', { className: 'sm-empty' }, '暂无操作日志')
  }

  function detailCard(title, child, key) {
    return h('section', { className: 'sm-card sm-detail-card', key }, [
      h('h2', { key: 'title' }, title),
      h('div', { className: 'sm-detail-card-body', key: 'body' }, child)
    ])
  }

  function renderInfoGrid(rows) {
    return h('div', { className: 'sm-info-grid' }, rows.map(([label, value]) => h('div', { className: 'sm-info-cell', key: label }, [h('span', { key: 'label' }, label), h('strong', { key: 'value' }, value || '-')])) )
  }

  function renderTips(order) {
    const tips = []
    ;(order.completenessTips || []).forEach((tip) => tips.push(tip))
    if (order.multipleIssueTip) tips.push(order.multipleIssueTip)
    if (!tips.length) return null
    return h('ul', { className: 'sm-tip-list' }, tips.map((tip) => h('li', { key: tip }, tip)))
  }

  function catalogBlock(title, items) {
    const values = (items || []).slice(0, 10)
    return h('section', { className: 'sm-catalog-block', key: title }, [
      h('h3', { key: 'h3' }, title),
      h('div', { className: 'sm-chip-row', key: 'chips' }, values.length ? values.map((item) => h('span', { key: item }, item)) : h('em', null, '暂无候选'))
    ])
  }

  function metricCard(label, value, desc) {
    return h('div', { className: 'sm-metric', key: label }, [h('strong', { key: 'value' }, value), h('span', { key: 'label' }, label), desc ? h('em', { key: 'desc' }, desc) : null])
  }

  function summarizeScope(catalogSummary) {
    return `${catalogSummary.customers.length} 个客户 / ${catalogSummary.projects.length} 个项目 / ${catalogSummary.locations.length} 个场所`
  }

  function scopePreviewLine(label, values) {
    const preview = (values || []).slice(0, 4)
    return h('div', { className: 'sm-scope-preview-row', key: label }, [
      h('span', { key: 'label' }, label),
      h('strong', { key: 'value' }, preview.length ? preview.join('、') : '暂无候选')
    ])
  }

  function buildImportFeedback(catalog, serviceData) {
    const summary = buildCatalogSummary(catalog || {}, [])
    const importedAt = serviceData && serviceData.importedAt ? `，导入时间 ${formatDate(serviceData.importedAt)}` : ''
    return {
      tone: 'success',
      title: '服务数据已进入候选范围',
      detail: `已更新 ${summary.customers.length} 个客户、${summary.projects.length} 个项目、${summary.locations.length} 个场所、${summary.devices.length} 台设备${importedAt}，后续报修会优先从这些数据中自动匹配。`
    }
  }

  function buildWorkOrderFeedback(order) {
    if (!order) {
      return {
        tone: 'warning',
        title: '等待 Agent 工具结果',
        detail: '还没有读取到新工单；请确认对话中的 Agent 是否已经调用生成工单工具。'
      }
    }
    const tips = []
    ;(order.completenessTips || []).forEach((tip) => tips.push(tip))
    if (order.multipleIssueTip) tips.push(order.multipleIssueTip)
    if (order.status === 'needs_supplement' || tips.length) {
      return {
        tone: 'warning',
        title: `生成成功：${order.workOrderNo || order.title || '新工单'}，状态：${STATUS_LABELS[order.status] || '待补充'}`,
        detail: tips.length ? `需要补充：${tips.join('；')}` : 'AI 已生成待补充工单，需要补充关键确认信息。'
      }
    }
    const scope = [order.customerName, order.projectName, order.siteName].filter(Boolean).join(' / ')
    return {
      tone: 'success',
      title: `生成成功：${order.workOrderNo || order.title || '新工单'}，状态：${STATUS_LABELS[order.status] || '待确认'}`,
      detail: scope || 'AI 已生成待确认工单，请在工单列表打开核对。'
    }
  }

  function getLatestWorkOrderId(data) {
    return data && data.summary && data.summary.latestWorkOrder && data.summary.latestWorkOrder.id
  }

  function getLatestServiceDataId(data) {
    return data && data.meta && data.meta.latestServiceData && data.meta.latestServiceData.id
  }

  function isNewWorkOrder(order, baselineId, startedAt) {
    if (!order || !order.id || order.id === baselineId) return false
    return isAfterBaseline(order.createdAt, startedAt)
  }

  function isNewServiceData(serviceData, baselineId, startedAt) {
    if (!serviceData || !serviceData.id || serviceData.id === baselineId) return false
    if (baselineId && serviceData.id !== baselineId) return true
    return isAfterBaseline(serviceData.importedAt || serviceData.createdAt, startedAt)
  }

  function isAfterBaseline(value, startedAt) {
    if (!value || !startedAt) return true
    const timestamp = new Date(value).getTime()
    const baseline = new Date(startedAt).getTime()
    if (!Number.isFinite(timestamp) || !Number.isFinite(baseline)) return true
    return timestamp >= baseline - 1000
  }

  function comboField(label, value, options, onChange, required) {
    const listId = `sm-list-${label}`
    return h('label', { className: 'sm-field', key: label }, [
      h('span', { key: 'label' }, [label, required ? h('b', { key: 'required' }, ' *') : null]),
      h('input', { key: 'input', value: value || '', list: listId, onChange: (event) => onChange(event.target.value) }),
      h('datalist', { id: listId, key: 'list' }, (options || []).map((option) => h('option', { value: option, key: option })))
    ])
  }

  function textField(label, value, onChange, options) {
    const required = options && options.required
    return h('label', { className: 'sm-field', key: label }, [
      h('span', { key: 'label' }, [label, required ? h('b', { key: 'required' }, ' *') : null]),
      h('input', { key: 'input', value: value || '', placeholder: (options && options.placeholder) || '', onChange: (event) => onChange(event.target.value) })
    ])
  }

  function textareaField(label, value, onChange, options) {
    const required = options && options.required
    return h('label', { className: 'sm-field sm-field-full', key: label }, [
      h('span', { key: 'label' }, [label, required ? h('b', { key: 'required' }, ' *') : null]),
      h('textarea', {
        key: 'textarea',
        value: Array.isArray(value) ? value.join('、') : value || '',
        rows: (options && options.rows) || 4,
        maxLength: options && options.maxLength,
        placeholder: (options && options.placeholder) || '',
        onChange: (event) => onChange(event.target.value)
      }),
      options && options.helpText ? h('em', { className: 'sm-field-help', key: 'help' }, options.helpText) : null,
      options && options.maxLength ? h('em', { className: 'sm-counter', key: 'counter' }, `${String(value || '').length} / ${options.maxLength}`) : null
    ])
  }

  function selectField(label, value, options, onChange, settings) {
    const valueKey = (settings && settings.valueKey) || 'code'
    const emptyLabel = (settings && settings.emptyLabel) || '请选择'
    const required = settings && settings.required
    const normalizedOptions = (options || []).map((option) => ({
      code: option.code || option.label,
      label: option.label || option.code,
      value: valueKey === 'label' ? option.label || option.code : option.code
    }))
    const hasCurrent = !value || normalizedOptions.some((option) => option.value === value)
    const finalOptions = hasCurrent ? normalizedOptions : [{ code: `current-${value}`, label: value, value }].concat(normalizedOptions)
    return h('label', { className: 'sm-field', key: label }, [
      h('span', { key: 'label' }, [label, required ? h('b', { key: 'required' }, ' *') : null]),
      h('select', { key: 'select', value: value || '', onChange: (event) => onChange(event.target.value) }, [h('option', { key: 'empty', value: '' }, emptyLabel)].concat(finalOptions.map((option) => h('option', { key: option.code, value: option.value }, option.label))))
    ])
  }

  function normalizeViewData(value) {
    return Object.assign({ items: [], total: 0, summary: {}, meta: {} }, value || {})
  }

  function normalizeWorkOrderForm(workOrder) {
    const normalized = Object.assign({}, workOrder || {})
    normalized.confirmedPartsText = formatList(normalized.confirmedParts || normalized.suggestedParts)
    return normalized
  }

  function normalizeReportPayload(form) {
    return {
      customerName: form.customerName,
      projectName: form.projectName,
      siteName: form.siteName,
      reporterName: form.reporterName,
      reporterDepartment: form.reporterDepartment,
      reporterContact: form.reporterContact,
      originalContent: form.originalContent,
      title: form.title,
      deviceType: form.deviceType,
      deviceName: form.deviceName,
      deviceNo: form.deviceNo,
      faultCategory: form.faultCategory,
      faultPhenomenon: form.faultPhenomenon,
      faultCode: form.faultCode,
      location: form.location || form.siteName,
      impactScope: form.impactScope,
      urgency: form.urgency,
      serviceType: form.serviceType,
      needOnsite: toBoolean(form.needOnsite),
      aiDiagnosis: form.aiDiagnosis,
      suggestedAction: form.suggestedAction,
      recommendedDepartment: form.recommendedDepartment,
      recommendedRole: form.recommendedRole,
      recommendedDispatchAdvice: form.recommendedDispatchAdvice,
      suggestedParts: splitTextList(form.suggestedParts),
      completenessTips: splitTextList(form.completenessTips),
      processingRemark: form.processingRemark
    }
  }

  function normalizeActionPayload(form) {
    return Object.assign({}, form, {
      needOnsite: toBoolean(form.needOnsite),
      confirmedParts: splitTextList(form.confirmedPartsText) || form.confirmedParts,
      reason: form.reason,
      processingResult: form.processingResult,
      processingSummary: form.processingSummary
    })
  }

  function createEmptyReportForm() {
    return {
      customerName: '',
      projectName: '',
      siteName: '',
      reporterName: '',
      reporterDepartment: '',
      reporterContact: '',
      deviceType: '',
      deviceName: '',
      originalContent: '',
      urgency: 'medium',
      serviceType: 'repair',
      needOnsite: 'true'
    }
  }

  function buildCatalogSummary(catalog, items) {
    const catalogCustomers = uniqueCatalogLabels(catalog.customers)
    const catalogProjects = uniqueCatalogLabels(catalog.projects)
    const catalogLocations = uniqueCatalogLabels(catalog.locations)
    const itemCustomers = unique((items || []).map((item) => item.customerName))
    const itemProjects = unique((items || []).map((item) => item.projectName))
    const itemLocations = unique((items || []).map((item) => item.siteName || item.location))
    return {
      customers: catalogCustomers.length ? catalogCustomers : itemCustomers.length ? itemCustomers : ['博雅大厦', '远帆科技集团', '万胜智能'],
      projects: catalogProjects.length ? catalogProjects : itemProjects.length ? itemProjects : ['一周', '年度维保', '设备巡检'],
      locations: catalogLocations.length ? catalogLocations : itemLocations,
      devices: catalog.devices || [],
      deviceTypes: unique((catalog.deviceTypes || []).map((item) => item.label)),
      departments: unique((catalog.departments || []).map((item) => item.label)),
      roles: unique((catalog.roles || []).map((item) => item.label)),
      parts: unique((catalog.parts || []).map((item) => item.label))
    }
  }

  function uniqueCatalogLabels(items) {
    return unique((items || []).map((item) => {
      if (!item || typeof item !== 'object') return item
      return item.label || item.name || item.title || item.code || item.id
    }))
  }

  function unique(items) {
    return Array.from(new Set((items || []).filter(Boolean).map((item) => String(item))))
  }

  function splitTextList(value) {
    if (Array.isArray(value)) return value
    if (!value || typeof value !== 'string') return undefined
    const items = value.split(/[,，、;；\n]+/).map((item) => item.trim()).filter(Boolean)
    return items.length ? items : undefined
  }

  function statusOptions() {
    return Object.keys(STATUS_LABELS).map((code) => ({ code, label: STATUS_LABELS[code] }))
  }

  function urgencyOptions() {
    return Object.keys(URGENCY_LABELS).map((code) => ({ code, label: URGENCY_LABELS[code] }))
  }

  function processingResultOptions() {
    return Object.keys(PROCESSING_RESULT_LABELS).map((code) => ({ code, label: PROCESSING_RESULT_LABELS[code] }))
  }

  function badge(label, tone) {
    return h('span', { className: `sm-badge ${tone || ''}`, key: `badge-${label}` }, label)
  }

  function statPill(label, value) {
    return h('span', { className: 'sm-stat-pill', key: label }, [h('strong', { key: 'value' }, value || 0), h('em', { key: 'label' }, label)])
  }

  function basicRows(rows) {
    return h(
      'dl',
      { className: 'sm-basic-rows' },
      rows.flatMap(([label, value]) => [h('dt', { key: `${label}-dt` }, label), h('dd', { key: `${label}-dd` }, value || '-')])
    )
  }

  function formatList(value) {
    if (Array.isArray(value)) return value.join('、')
    return value || ''
  }

  function formatDate(value) {
    if (!value) return '-'
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return String(value)
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(date).reduce((acc, part) => {
      acc[part.type] = part.value
      return acc
    }, {})
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
  }

  function formatDuration(minutes) {
    const value = Number(minutes || 0)
    if (!value) return '-'
    const hours = Math.floor(value / 60)
    const rest = value % 60
    return `${hours ? `${hours}小时` : ''}${rest ? `${rest}分钟` : ''}` || '0分钟'
  }

  function toBoolean(value) {
    if (value === true || value === 'true') return true
    if (value === false || value === 'false') return false
    return undefined
  }

  function resolveText(value) {
    if (!value) return ''
    if (typeof value === 'string') return value
    return value.zh_Hans || value.en_US || ''
  }

  function statValue(stats, snakeKey, camelKey) {
    return stats[snakeKey] || stats[camelKey] || 0
  }

  function logActionLabel(action) {
    return (
      {
        ai_generated: 'AI 生成工单',
        field_updated: '字段修改',
        mark_needs_supplement: '补充完善',
        supplement_saved: '保存补充',
        supplement_draft_prepared: '生成补充草稿',
        confirm_processing: '确认处理',
        mark_processed: '标记已处理',
        reject_closed: '驳回关闭'
      }[action] || action
    )
  }

  function stopAndRun(event, fn) {
    event.stopPropagation()
    fn()
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
      :root {
        color-scheme: light;
        --sm-bg: #f5f7fb;
        --sm-card: #ffffff;
        --sm-text: #142033;
        --sm-muted: #64748b;
        --sm-border: #dce4ef;
        --sm-border-strong: #cbd7e6;
        --sm-soft: #f8fafc;
        --sm-blue: #1769e0;
        --sm-blue-dark: #0d55c2;
        --sm-blue-soft: #eaf2ff;
        --sm-green: #16834a;
        --sm-green-soft: #e8f7ee;
        --sm-red: #d3382d;
        --sm-red-soft: #fff0ee;
        --sm-amber: #c77900;
        --sm-amber-soft: #fff6df;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        width: 100%;
        min-height: 100%;
        overflow: hidden;
      }
      body {
        background: var(--sm-bg);
        color: var(--sm-text);
        font-family: Inter, "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
      }
      button, input, textarea, select {
        font: inherit;
        letter-spacing: 0;
      }
      .sm-shell {
        width: 100%;
        max-height: 100vh;
        min-height: 0;
        overflow: hidden;
        background: var(--sm-bg);
      }
      .sm-system-header {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 58px;
        border-bottom: 1px solid var(--sm-border);
        background: rgba(255,255,255,.96);
        padding: 10px 16px;
      }
      .sm-brand {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        gap: 10px;
      }
      .sm-logo-dot {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: linear-gradient(135deg, #1769e0, #18a058);
        box-shadow: 0 8px 18px rgba(23,105,224,.18);
      }
      .sm-brand strong {
        display: block;
        font-size: 17px;
        line-height: 1.2;
        font-weight: 780;
      }
      .sm-brand span:not(.sm-logo-dot) {
        display: block;
        margin-top: 2px;
        color: var(--sm-muted);
        font-size: 12px;
      }
      .sm-header-actions,
      .sm-import-actions,
      .sm-form-actions,
      .sm-query-actions,
      .sm-inline-actions,
      .sm-detail-actions,
      .sm-toolbar-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 10px;
      }
      .sm-content {
        max-height: calc(100vh - 58px);
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
        padding: 12px 14px 16px;
      }
      .sm-card {
        min-width: 0;
        border: 1px solid var(--sm-border);
        border-radius: 8px;
        background: var(--sm-card);
        box-shadow: 0 6px 18px rgba(21,36,57,.045);
      }
      .sm-card-title {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 14px;
        margin-bottom: 12px;
      }
      h1, h2, h3, p {
        margin-top: 0;
      }
      h1 {
        margin-bottom: 0;
        font-size: 18px;
        line-height: 1.3;
        font-weight: 760;
      }
      h2 {
        margin-bottom: 12px;
        font-size: 14px;
        line-height: 1.35;
        font-weight: 740;
      }
      h3 {
        margin-bottom: 8px;
        font-size: 13px;
      }
      p {
        line-height: 1.55;
      }
      .sm-card-title p,
      .sm-card-title span,
      .sm-muted-line {
        color: var(--sm-muted);
        font-size: 12px;
      }
      .sm-home {
        display: grid;
        gap: 12px;
      }
      .sm-home-panels {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr);
        gap: 12px;
      }
      .sm-import-card,
      .sm-range-card,
      .sm-ai-feedback-card,
      .sm-create-card,
      .sm-list-card,
      .sm-detail-card,
      .sm-scope-table-card,
      .sm-donut-card,
      .sm-catalog-card {
        padding: 14px;
      }
      .sm-upload-btn {
        position: relative;
        overflow: hidden;
      }
      .sm-upload-btn input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      .sm-upload-name {
        margin: 10px 0 0;
        color: #40516a;
        font-size: 12px;
      }
      .sm-scope-preview {
        display: grid;
        gap: 8px;
      }
      .sm-scope-preview-row {
        display: grid;
        grid-template-columns: 46px minmax(0, 1fr);
        align-items: start;
        gap: 10px;
        border: 1px solid var(--sm-border);
        border-radius: 7px;
        background: var(--sm-soft);
        padding: 8px 10px;
      }
      .sm-scope-preview-row span {
        color: var(--sm-muted);
        font-size: 12px;
        font-weight: 700;
      }
      .sm-scope-preview-row strong {
        min-width: 0;
        color: #243146;
        overflow-wrap: anywhere;
        font-size: 13px;
        font-weight: 680;
      }
      .sm-ai-feedback-card {
        border-color: #d7e3f3;
      }
      .sm-ai-feedback-card.is-working {
        border-color: #9bc7ff;
        background: #f4f9ff;
      }
      .sm-ai-feedback-card.is-success {
        border-color: #a8dfbd;
        background: #f3fbf6;
      }
      .sm-ai-feedback-card.is-warning {
        border-color: #f1c36d;
        background: #fffaf0;
      }
      .sm-feedback-detail {
        margin: 0;
        color: #324158;
        font-size: 13px;
      }
      .sm-kpi-grid,
      .sm-scope-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }
      .sm-metric {
        min-width: 0;
        border: 1px solid var(--sm-border);
        border-radius: 7px;
        background: linear-gradient(180deg, #fff, #f9fbff);
        padding: 12px;
      }
      .sm-metric strong {
        display: block;
        color: var(--sm-blue);
        font-size: 20px;
        font-weight: 800;
      }
      .sm-metric span,
      .sm-metric em {
        display: block;
        margin-top: 4px;
        color: #4c5c72;
        font-size: 12px;
        font-style: normal;
      }
      .sm-metric em {
        color: var(--sm-muted);
      }
      .sm-form-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 12px;
      }
      .sm-form-grid-4 {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
      .sm-form-grid-2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .sm-field {
        display: flex;
        min-width: 0;
        flex-direction: column;
        gap: 6px;
        color: #4a586d;
        font-size: 12px;
        font-weight: 650;
      }
      .sm-field b {
        color: var(--sm-red);
      }
      .sm-field-full {
        grid-column: 1 / -1;
        margin-top: 10px;
      }
      .sm-field-group-note {
        margin: -2px 0 10px;
        color: var(--sm-muted);
        font-size: 12px;
        line-height: 1.6;
      }
      input, textarea, select {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--sm-border);
        border-radius: 6px;
        background: #fff;
        color: var(--sm-text);
        padding: 8px 10px;
        outline: none;
        font-size: 13px;
        font-weight: 500;
      }
      textarea {
        resize: vertical;
        line-height: 1.55;
      }
      input:focus, textarea:focus, select:focus {
        border-color: #80aef0;
        box-shadow: 0 0 0 3px rgba(23,105,224,.1);
      }
      .sm-counter {
        align-self: flex-end;
        color: var(--sm-muted);
        font-size: 11px;
        font-style: normal;
      }
      .sm-field-help {
        color: var(--sm-muted);
        font-size: 12px;
        font-style: normal;
        font-weight: 500;
      }
      .sm-form-actions,
      .sm-detail-actions {
        margin-top: 14px;
      }
      .sm-btn {
        min-height: 34px;
        border: 1px solid transparent;
        border-radius: 6px;
        padding: 7px 15px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 720;
        white-space: nowrap;
      }
      .sm-btn:disabled {
        cursor: not-allowed;
        opacity: .55;
      }
      .sm-btn-primary {
        background: var(--sm-blue);
        color: #fff;
      }
      .sm-btn-primary:hover:not(:disabled) {
        background: var(--sm-blue-dark);
      }
      .sm-btn-light {
        background: var(--sm-blue-soft);
        border-color: #c7dcff;
        color: var(--sm-blue-dark);
      }
      .sm-btn-plain {
        background: #fff;
        border-color: var(--sm-border);
        color: #3f4e64;
      }
      .sm-btn-plain.danger {
        color: var(--sm-red);
      }
      .sm-wide-btn {
        width: 100%;
        margin-top: 10px;
      }
      .sm-notice {
        margin-bottom: 12px;
        border: 1px solid #9bc7ff;
        border-radius: 7px;
        background: #edf6ff;
        color: #0b559f;
        padding: 10px 12px;
        font-size: 13px;
      }
      .sm-filter-grid {
        display: grid;
        grid-template-columns: 150px 150px 180px minmax(180px, 1fr) auto;
        gap: 12px;
        align-items: end;
        margin-bottom: 12px;
      }
      .sm-inline-stats {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .sm-stat-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--sm-border);
        border-radius: 999px;
        background: #fff;
        padding: 4px 9px;
      }
      .sm-stat-pill strong {
        color: var(--sm-blue);
        font-size: 13px;
      }
      .sm-stat-pill em {
        color: var(--sm-muted);
        font-size: 12px;
        font-style: normal;
      }
      .sm-table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--sm-border);
        border-radius: 7px;
      }
      .sm-table {
        width: 100%;
        min-width: 1080px;
        border-collapse: collapse;
        background: #fff;
        font-size: 13px;
      }
      .sm-compact-table {
        min-width: 0;
      }
      .sm-table th,
      .sm-table td {
        border-bottom: 1px solid #e8edf4;
        padding: 8px 10px;
        text-align: left;
        vertical-align: middle;
        white-space: nowrap;
      }
      .sm-table th {
        background: #f7f9fc;
        color: #4b5a70;
        font-size: 12px;
        font-weight: 760;
      }
      .sm-table tbody tr {
        cursor: pointer;
      }
      .sm-table tbody tr:hover {
        background: #f4f8ff;
      }
      .sm-table-empty {
        color: var(--sm-muted);
        text-align: center !important;
      }
      .sm-link-btn {
        border: 0;
        background: transparent;
        color: var(--sm-blue);
        cursor: pointer;
        padding: 2px 5px;
        font-size: 13px;
        font-weight: 650;
      }
      .sm-badge,
      .sm-mini-tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 22px;
        border-radius: 5px;
        padding: 2px 8px;
        background: #edf2f7;
        color: #536174;
        font-size: 12px;
        font-weight: 720;
      }
      .sm-mini-tag {
        margin-right: 5px;
      }
      .status-pending_confirmation {
        background: var(--sm-blue-soft);
        color: var(--sm-blue);
      }
      .status-needs_supplement,
      .urgency-medium {
        background: var(--sm-amber-soft);
        color: var(--sm-amber);
      }
      .status-processing,
      .status-processed,
      .urgency-low {
        background: var(--sm-green-soft);
        color: var(--sm-green);
      }
      .status-rejected {
        background: #eef2f7;
        color: #667085;
      }
      .urgency-high {
        background: var(--sm-red-soft);
        color: var(--sm-red);
      }
      .sm-screen-toolbar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .sm-back-btn {
        border: 0;
        background: transparent;
        color: #40516a;
        cursor: pointer;
        padding: 0;
        font-weight: 700;
      }
      .sm-scope-screen {
        display: grid;
        gap: 12px;
      }
      .sm-scope-layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr);
        gap: 12px;
      }
      .sm-donut-row {
        display: grid;
        grid-template-columns: 160px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
      }
      .sm-donut {
        display: grid;
        place-items: center;
        width: 136px;
        height: 136px;
        border-radius: 50%;
        background: conic-gradient(#1769e0 0 42%, #18a058 42% 66%, #7c3aed 66% 80%, #f59e0b 80% 90%, #94a3b8 90% 100%);
        color: #fff;
      }
      .sm-donut strong {
        display: block;
        font-size: 28px;
        line-height: 1;
      }
      .sm-donut span {
        display: block;
        font-size: 12px;
      }
      .sm-legend {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .sm-legend li {
        display: grid;
        grid-template-columns: 10px minmax(0, 1fr) auto;
        gap: 8px;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
      }
      .sm-legend span {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--sm-blue);
      }
      .sm-legend em {
        color: var(--sm-muted);
        font-style: normal;
      }
      .sm-catalog-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
      }
      .sm-catalog-block {
        min-width: 0;
        border: 1px solid var(--sm-border);
        border-radius: 7px;
        background: var(--sm-soft);
        padding: 12px;
      }
      .sm-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
      }
      .sm-chip-row span {
        max-width: 100%;
        border: 1px solid var(--sm-border);
        border-radius: 5px;
        background: #fff;
        color: #40516a;
        padding: 4px 8px;
        overflow-wrap: anywhere;
        font-size: 12px;
      }
      .sm-detail-screen {
        display: grid;
        gap: 12px;
      }
      .sm-stepper {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 8px;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .sm-stepper li {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        color: var(--sm-muted);
        font-size: 12px;
      }
      .sm-stepper span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e8eef6;
        color: #637083;
        font-size: 12px;
        font-weight: 780;
      }
      .sm-stepper li.active {
        color: var(--sm-blue);
      }
      .sm-stepper li.active span {
        background: var(--sm-blue);
        color: #fff;
      }
      .sm-detail-grid {
        display: grid;
        grid-template-columns: minmax(280px, .9fr) minmax(360px, 1.1fr);
        gap: 12px;
      }
      .sm-detail-card {
        min-width: 0;
      }
      .sm-basic-rows {
        display: grid;
        grid-template-columns: 110px minmax(0, 1fr);
        gap: 10px 12px;
        margin: 0;
        font-size: 13px;
      }
      .sm-basic-rows dt {
        color: #5c6a7f;
      }
      .sm-basic-rows dd {
        min-width: 0;
        margin: 0;
        color: #243146;
        font-weight: 620;
        overflow-wrap: anywhere;
      }
      .sm-original-text {
        margin-bottom: 0;
        color: #2f3d52;
        font-size: 13px;
      }
      .sm-info-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }
      .sm-info-cell {
        min-width: 0;
        border: 1px solid var(--sm-border);
        border-radius: 7px;
        background: var(--sm-soft);
        padding: 10px;
      }
      .sm-info-cell span {
        display: block;
        margin-bottom: 6px;
        color: var(--sm-muted);
        font-size: 12px;
      }
      .sm-info-cell strong {
        display: block;
        color: #26344a;
        font-size: 13px;
        font-weight: 650;
        overflow-wrap: anywhere;
      }
      .sm-tip-list,
      .sm-cause-list {
        margin: 10px 0 0;
        padding-left: 18px;
        color: #724b00;
        font-size: 13px;
      }
      .sm-cause-list {
        color: #344258;
      }
      .sm-alert-card,
      .sm-soft-note {
        border: 1px solid #ffd6d1;
        border-radius: 7px;
        background: #fff7f6;
        padding: 12px;
        color: #7a2d28;
        font-size: 13px;
      }
      .sm-soft-note {
        border-color: var(--sm-border);
        background: var(--sm-soft);
        color: #43536a;
      }
      .sm-alert-card p,
      .sm-soft-note p {
        margin-bottom: 8px;
      }
      .sm-alert-card ul {
        margin: 0;
        padding-left: 18px;
      }
      .sm-log-list {
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .sm-log-list li {
        display: grid;
        grid-template-columns: 14px minmax(0, 1fr);
        gap: 9px;
        padding-bottom: 12px;
      }
      .sm-log-list li > span {
        width: 8px;
        height: 8px;
        margin-top: 6px;
        border-radius: 50%;
        background: var(--sm-blue);
      }
      .sm-log-list strong {
        margin-right: 8px;
        color: #26344a;
        font-size: 13px;
      }
      .sm-log-list em {
        color: var(--sm-muted);
        font-size: 12px;
        font-style: normal;
      }
      .sm-log-list p {
        margin: 5px 0 0;
        color: #526176;
        font-size: 13px;
      }
      .sm-empty {
        border-radius: 7px;
        background: #f8fafc;
        color: var(--sm-muted);
        padding: 22px 14px;
        text-align: center;
        font-size: 13px;
      }
      @media (max-width: 1160px) {
        .sm-kpi-grid,
        .sm-scope-kpis,
        .sm-form-grid-4,
        .sm-info-grid,
        .sm-catalog-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .sm-filter-grid,
        .sm-home-panels,
        .sm-scope-layout,
        .sm-detail-grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .sm-system-header,
        .sm-card-title,
        .sm-header-actions,
        .sm-import-actions,
        .sm-form-actions,
        .sm-query-actions,
        .sm-detail-actions,
        .sm-screen-toolbar {
          align-items: stretch;
          flex-direction: column;
        }
        .sm-content {
          padding: 10px;
        }
        .sm-kpi-grid,
        .sm-scope-kpis,
        .sm-form-grid,
        .sm-form-grid-2,
        .sm-form-grid-4,
        .sm-info-grid,
        .sm-catalog-grid,
        .sm-stepper {
          grid-template-columns: 1fr;
        }
        .sm-btn,
        .sm-upload-btn {
          width: 100%;
          text-align: center;
        }
        .sm-basic-rows {
          grid-template-columns: 92px minmax(0, 1fr);
        }
      }
    `
    document.head.appendChild(style)
  }

  const rootElement = document.getElementById('root')
  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootElement).render(h(App))
  } else {
    ReactDOM.render(h(App), rootElement)
  }
})()
