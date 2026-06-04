;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()
  let currentLocale = 'en_US'

  const TABS = ['workspace', 'graph', 'insights', 'rules', 'scenarios', 'assistant', 'tools']
  const DETAIL_TABS = ['attributes', 'relations', 'actions', 'influence', 'implicit']
  const INSIGHT_TYPES = ['all', 'risk', 'opportunity', 'trend', 'relation', 'decision']
  const QUICK_QUESTIONS = [
    { key: 'prescriptions', label: 'assistant.quick.prescriptions', text: 'assistant.question.prescriptions' },
    { key: 'targets', label: 'assistant.quick.targets', text: 'assistant.question.targets' },
    { key: 'risks', label: 'assistant.quick.risks', text: 'assistant.question.risks' },
    { key: 'actions', label: 'assistant.quick.actions', text: 'assistant.question.actions' }
  ]

  const COPY = {
    en_US: {
      title: 'Sales Ontology',
      subtitle: 'Perception, reasoning, execution, effects, scenarios, and governed action proposals.',
      initializing: 'Initializing Sales Ontology...',
      loading: 'Loading Sales Ontology data...',
      refresh: 'Refresh',
      seedDemoData: 'Seed Demo Data',
      runPerception: 'Run Perception',
      generateSuggestions: 'Generate Suggestions',
      runReasoning: 'Run Reasoning',
      simulateScenario: 'Simulate Scenario',
      working: 'Working...',
      search: 'Search',
      searchPlaceholder: 'Search objects, insights, actions...',
      noRecords: 'No records yet.',
      noGraph: 'No graph nodes yet.',
      configureOntology: 'Configure the data-xpert business ontology resource to load ontology objects.',
      pageInfo: 'Page {{page}} / {{totalPages}}, {{total}} total',
      previous: 'Previous',
      next: 'Next',
      selected: 'Selected',
      close: 'Close',
      approve: 'Approve',
      reject: 'Reject',
      execute: 'Execute',
      sendToAssistant: 'Send to Assistant',
      sentToAssistant: 'Sent to assistant chat.',
      actionDone: 'Done',
      actionFailed: 'Action failed',
      requiresApproval: 'Requires approval',
      directExecution: 'Direct execution allowed',
      recommendationFallback: 'Review forecast, confidence, and execution paths before creating governed action proposals.',
      paths: {
        aggressive: 'Aggressive path',
        conservative: 'Conservative path',
        balanced: 'Balanced path'
      },
      tabs: {
        workspace: 'Workbench',
        graph: 'Knowledge Graph',
        insights: 'Smart Insights',
        rules: 'Reasoning Rules',
        scenarios: 'Scenario Simulation',
        assistant: 'AI Assistant',
        tools: 'AI Toolbox'
      },
      metrics: {
        runs: 'Runs',
        perceptions: 'Perceptions',
        highRisk: 'High Risk',
        suggestions: 'Suggestions',
        pendingActions: 'Pending Actions',
        effects: 'Effects',
        scenarios: 'Scenarios',
        reminders: 'Reminders'
      },
      sections: {
        recentRuns: 'Recent Runs',
        pendingActions: 'Pending Actions',
        highRiskAlerts: 'High-Risk Alerts',
        decisionEffects: 'Decision Effects',
        graphLegend: 'Object Types',
        graphCanvas: 'Graph Canvas',
        graphDetail: 'Object Detail',
        insightStream: 'Insight Stream',
        ruleLibrary: 'Rule Library',
        reasoningRuns: 'Reasoning Runs',
        scenarioList: 'Available Scenarios',
        decisionRecommendation: 'Decision Recommendation',
        executionPaths: 'Execution Paths',
        assistantContext: 'Assistant Context',
        quickQuestions: 'Quick Questions',
        recentToolRuns: 'Recent Tool Runs',
        toolStatus: 'Tool Status',
        executableActions: 'Executable Actions',
        reasoningTypes: 'Reasoning Types'
      },
      detail: {
        attributes: 'Attributes',
        relations: 'Relations',
        actions: 'Actions',
        influence: 'Influence',
        implicit: 'Implicit Relations'
      },
      insights: {
        all: 'All',
        risk: 'Risk',
        opportunity: 'Opportunity',
        trend: 'Trend',
        relation: 'Relation',
        decision: 'Decision'
      },
      graph: {
        filterAll: 'All types',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        resetZoom: 'Reset',
        fullscreen: 'Fullscreen',
        clickHint: 'Click a node to inspect attributes, relations, actions, influence, and implicit links.'
      },
      assistant: {
        quick: {
          prescriptions: 'Prescription Trend',
          targets: 'Sales Targets',
          risks: 'Compliance Risks',
          actions: 'Next Actions'
        },
        question: {
          prescriptions: 'Please analyze recent prescription volume trends and explain the main risk drivers.',
          targets: 'Please summarize Sales Ontology sales target achievement and underperforming objects.',
          risks: 'Please inspect compliance risks and suggest governed follow-up actions.',
          actions: 'Please generate next-best-action suggestions and identify which ones need approval.'
        }
      },
      states: {
        configured: 'Configured',
        notConfigured: 'Not configured',
        available: 'Available',
        recent: 'Recently used',
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
        executed: 'Executed',
        failed: 'Failed'
      }
    },
    zh_Hans: {
      title: 'Sales Ontology',
      subtitle: '感知、推理、执行、效果、场景推演和受控动作草案。',
      initializing: '正在初始化 Sales Ontology...',
      loading: '正在加载 Sales Ontology 数据...',
      refresh: '刷新',
      seedDemoData: '初始化演示数据',
      runPerception: '运行感知',
      generateSuggestions: '生成建议',
      runReasoning: '运行推理',
      simulateScenario: '运行推演',
      working: '处理中...',
      search: '搜索',
      searchPlaceholder: '搜索对象、洞察、动作...',
      noRecords: '暂无记录。',
      noGraph: '暂无图谱节点。',
      configureOntology: '请配置 data-xpert 业务本体资源后加载本体对象。',
      pageInfo: '第 {{page}} / {{totalPages}} 页，共 {{total}} 条',
      previous: '上一页',
      next: '下一页',
      selected: '选中',
      close: '关闭',
      approve: '批准',
      reject: '拒绝',
      execute: '标记执行',
      sendToAssistant: '发送给 Assistant',
      sentToAssistant: '已发送到 Assistant 对话。',
      actionDone: '完成',
      actionFailed: '操作失败',
      requiresApproval: '需要审批',
      directExecution: '可直接执行',
      recommendationFallback: '创建受控动作草案前，请先复核预测、置信度和执行路径。',
      paths: {
        aggressive: '积极进攻路径',
        conservative: '稳健保守路径',
        balanced: '平衡优化路径'
      },
      tabs: {
        workspace: '工作台',
        graph: '知识图谱',
        insights: '智能洞察',
        rules: '推理规则',
        scenarios: '场景推演',
        assistant: 'AI 助手',
        tools: 'AI 工具箱'
      },
      metrics: {
        runs: '运行',
        perceptions: '感知',
        highRisk: '高风险',
        suggestions: '建议',
        pendingActions: '待审批动作',
        effects: '效果',
        scenarios: '场景',
        reminders: '提醒'
      },
      sections: {
        recentRuns: '最近运行',
        pendingActions: '待决策事项',
        highRiskAlerts: '高风险预警',
        decisionEffects: '决策效果',
        graphLegend: '对象类型',
        graphCanvas: '图谱画布',
        graphDetail: '对象详情',
        insightStream: '洞察流',
        ruleLibrary: '规则库',
        reasoningRuns: '推理记录',
        scenarioList: '可用场景',
        decisionRecommendation: '决策建议',
        executionPaths: '执行路径',
        assistantContext: '助手上下文',
        quickQuestions: '快捷问题',
        recentToolRuns: '最近工具运行',
        toolStatus: '工具状态',
        executableActions: '可执行动作',
        reasoningTypes: '推理类型'
      },
      detail: {
        attributes: '属性',
        relations: '关联',
        actions: '动作',
        influence: '影响传播',
        implicit: '隐含关系'
      },
      insights: {
        all: '全部',
        risk: '风险',
        opportunity: '机会',
        trend: '趋势',
        relation: '关系',
        decision: '决策'
      },
      graph: {
        filterAll: '全部类型',
        zoomIn: '放大',
        zoomOut: '缩小',
        resetZoom: '重置',
        fullscreen: '全屏',
        clickHint: '点击节点查看属性、关联、动作、影响传播和隐含关系。'
      },
      assistant: {
        quick: {
          prescriptions: '处方量趋势',
          targets: '销售目标',
          risks: '合规风险',
          actions: '下一步动作'
        },
        question: {
          prescriptions: '请分析最近处方量趋势，并解释主要风险驱动因素。',
          targets: '请总结 Sales Ontology 销售目标达成情况和低达成对象。',
          risks: '请检查合规风险，并提出需要治理的后续动作。',
          actions: '请生成下一步最佳行动建议，并识别哪些建议需要审批。'
        }
      },
      states: {
        configured: '已配置',
        notConfigured: '未配置',
        available: '可用',
        recent: '最近使用',
        pending: '待审批',
        approved: '已批准',
        rejected: '已拒绝',
        executed: '已执行',
        failed: '失败'
      }
    }
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

  function request(type, body, transfer) {
    const requestId = String(++requestSequence)
    return new Promise((resolve, reject) => {
      pending.set(requestId, { resolve, reject })
      try {
        post(type, Object.assign({ requestId }, body || {}), transfer)
      } catch (error) {
        pending.delete(requestId)
        reject(error)
      }
    })
  }

  function reportResize() {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 620)
    post('resize', { height, viewportBound: true })
  }

  window.addEventListener('message', (event) => {
    const message = event.data
    if (!isObject(message) || message.channel !== CHANNEL || message.protocolVersion !== VERSION) {
      return
    }

    if (message.type === 'init') {
      instanceId = message.instanceId
      const nextContext = {
        manifest: message.manifest,
        payload: message.payload,
        initialQuery: message.initialQuery || {},
        locale: message.locale,
        theme: message.theme
      }
      window.__salesOntologySetContext && window.__salesOntologySetContext(nextContext)
      setTimeout(reportResize, 0)
      return
    }

    if (message.instanceId !== instanceId) return

    if (message.type === 'hostEvent') {
      window.__salesOntologyReload && window.__salesOntologyReload()
      return
    }

    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || 'Remote request failed'))
      } else {
        item.resolve(message)
      }
    }
  })

  function App() {
    const [context, setContext] = React.useState(null)
    const [activeTab, setActiveTab] = React.useState('workspace')
    const [query, setQuery] = React.useState({ page: 1, pageSize: 30, parameters: { viewTab: 'workspace' } })
    const [searchText, setSearchText] = React.useState('')
    const [data, setData] = React.useState({})
    const [loading, setLoading] = React.useState(false)
    const [busy, setBusy] = React.useState('')
    const [notice, setNotice] = React.useState(null)
    const [selectedNodeId, setSelectedNodeId] = React.useState('')
    const [detailTab, setDetailTab] = React.useState('attributes')
    const [insightType, setInsightType] = React.useState('all')
    const [graphType, setGraphType] = React.useState('all')
    const [zoom, setZoom] = React.useState(1)

    window.__salesOntologySetContext = setContext
    window.__salesOntologyReload = () => loadData(query)

    const locale = normalizeLocale(context && context.locale)
    currentLocale = locale
    const t = React.useCallback((key, params) => translate(locale, key, params), [locale])

    React.useEffect(() => {
      if (!context) return
      const nextQuery = buildQuery(context, {
        page: 1,
        parameters: { viewTab: activeTab, insightType }
      })
      setQuery(nextQuery)
      setSearchText(nextQuery.search || '')
      loadData(nextQuery)
    }, [context])

    React.useEffect(() => {
      reportResize()
    }, [data, loading, busy, notice, activeTab, selectedNodeId, detailTab, insightType, graphType, zoom])

    async function loadData(nextQuery) {
      setLoading(true)
      setNotice(null)
      try {
        const response = await request('requestData', { query: nextQuery || query })
        setData(response.data || {})
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('actionFailed') })
      } finally {
        setLoading(false)
      }
    }

    function updateQuery(patch) {
      const nextQuery = buildQuery(context, Object.assign({}, query, patch, {
        parameters: Object.assign({}, query.parameters || {}, patch.parameters || {})
      }))
      setQuery(nextQuery)
      loadData(nextQuery)
      return nextQuery
    }

    function switchTab(tab) {
      setActiveTab(tab)
      setSelectedNodeId('')
      const nextQuery = updateQuery({
        page: 1,
        selectionId: undefined,
        parameters: { viewTab: tab, insightType, graphObjectType: graphType === 'all' ? undefined : graphType }
      })
      setQuery(nextQuery)
    }

    function applySearch() {
      updateQuery({ page: 1, search: searchText.trim() || undefined })
    }

    function changeInsightType(type) {
      setInsightType(type)
      setActiveTab('insights')
      updateQuery({ page: 1, parameters: { viewTab: 'insights', insightType: type } })
    }

    function changeGraphType(type) {
      setGraphType(type)
      updateQuery({
        page: 1,
        parameters: {
          viewTab: 'graph',
          graphObjectType: type === 'all' ? undefined : type
        }
      })
    }

    function selectNode(node) {
      const id = node && node.id
      if (!id) return
      setSelectedNodeId(id)
      setDetailTab('attributes')
      updateQuery({ page: 1, selectionId: id, parameters: { viewTab: 'graph' } })
    }

    async function run(actionKey, input, targetId) {
      setBusy(actionKey + ':' + (targetId || 'toolbar'))
      setNotice(null)
      try {
        const response = await request('executeAction', {
          actionKey,
          targetId,
          input: input || {},
          parameters: query.parameters
        })
        const result = response.result || response
        if (result && result.success === false) {
          throw new Error(resolveText(result.message, t('actionFailed'), locale))
        }
        setNotice({ type: 'success', message: resolveText(result.message, t('actionDone'), locale) })
        await loadData(query)
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('actionFailed') })
      } finally {
        setBusy('')
      }
    }

    async function sendToAssistant(questionKey) {
      setBusy('assistant.chat.send_message')
      setNotice(null)
      try {
        const text = t(questionKey)
        await request('invokeClientCommand', {
          commandKey: 'assistant.chat.send_message',
          payload: {
            text,
            clientMessageId: 'sales-ontology-workbench:' + Date.now(),
            files: [],
            attachments: [],
            references: [],
            followUpMode: 'queue',
            state: {
              'sales-ontology': {
                source: 'workbench',
                tab: activeTab,
                query
              }
            }
          }
        })
        setNotice({ type: 'success', message: t('sentToAssistant') })
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('actionFailed') })
      } finally {
        setBusy('')
      }
    }

    if (!context) {
      return h('main', { className: 'so-shell' }, h('div', { className: 'so-loading' }, t('initializing')))
    }

    const meta = data.meta || {}
    const summary = data.summary || {}
    const graph = meta.graph || { nodes: [], edges: [], domainGroups: [] }
    const total = typeof data.total === 'number' ? data.total : 0
    const page = query.page || 1
    const pageSize = query.pageSize || 30
    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    return h(
      'main',
      { className: 'so-shell' },
      h(
        'header',
        { className: 'so-header' },
        h('div', { className: 'so-title' }, h('h1', null, t('title')), h('p', null, t('subtitle'))),
        h(
          'div',
          { className: 'so-toolbar' },
          controlButton(t('refresh'), 'refresh', busy, () => loadData(query)),
          controlButton(t('seedDemoData'), 'seed_database', busy, () => run('seed_database')),
          controlButton(t('runPerception'), 'run_perception', busy, () => run('run_perception')),
          controlButton(t('generateSuggestions'), 'generate_suggestions', busy, () => run('generate_suggestions'))
        )
      ),
      h(
        'nav',
        { className: 'so-tabs', 'aria-label': 'Sales Ontology tabs' },
        TABS.map((tab) =>
          h(
            'button',
            {
              key: tab,
              className: 'so-tab ' + (activeTab === tab ? 'active' : ''),
              onClick: () => switchTab(tab)
            },
            t('tabs.' + tab)
          )
        )
      ),
      h(
        'section',
        { className: 'so-searchbar' },
        h('input', {
          value: searchText,
          placeholder: t('searchPlaceholder'),
          onChange: (event) => setSearchText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter') applySearch()
          }
        }),
        h('button', { className: 'so-button', onClick: applySearch, disabled: loading }, t('search'))
      ),
      notice && h('div', { className: 'so-notice ' + notice.type }, notice.message),
      loading
        ? h('div', { className: 'so-loading' }, t('loading'))
        : h(
            React.Fragment,
            null,
            activeTab === 'workspace' && renderWorkspace(t, summary, meta, busy, run),
            activeTab === 'graph' && renderGraph(t, graph, selectedNodeId, detailTab, setDetailTab, graphType, changeGraphType, zoom, setZoom, selectNode),
            activeTab === 'insights' && renderInsights(t, data.items || [], meta, insightType, changeInsightType),
            activeTab === 'rules' && renderRules(t, data.items || [], meta, busy, run),
            activeTab === 'scenarios' && renderScenarios(t, data.items || [], meta, busy, run),
            activeTab === 'assistant' && renderAssistant(t, data.items || [], meta, busy, sendToAssistant),
            activeTab === 'tools' && renderTools(t, data.items || [], meta)
          ),
      h(
        'footer',
        { className: 'so-pagination' },
        h('span', null, t('pageInfo', { page, totalPages, total })),
        h(
          'div',
          { className: 'so-pagination-actions' },
          h('button', { className: 'so-button', disabled: loading || page <= 1, onClick: () => updateQuery({ page: Math.max(1, page - 1) }) }, t('previous')),
          h('button', { className: 'so-button', disabled: loading || page >= totalPages, onClick: () => updateQuery({ page: page + 1 }) }, t('next'))
        )
      )
    )
  }

  function renderWorkspace(t, summary, meta, busy, run) {
    const highRisk = (meta.perceptions || []).filter((item) => (item.riskScore || 0) >= 0.55)
    return h(
      'section',
      { className: 'so-stack' },
      h(
        'section',
        { className: 'so-kpis' },
        metric(t('metrics.runs'), summary.runs),
        metric(t('metrics.perceptions'), summary.perceptions),
        metric(t('metrics.highRisk'), summary.highRiskPerceptions),
        metric(t('metrics.suggestions'), summary.suggestions),
        metric(t('metrics.pendingActions'), summary.pendingProposals),
        metric(t('metrics.effects'), summary.effects),
        metric(t('metrics.scenarios'), summary.scenarios),
        metric(t('metrics.reminders'), summary.reminders)
      ),
      h(
        'section',
        { className: 'so-grid three' },
        panel(t('sections.pendingActions'), list(meta.proposals || [], (item) => renderProposal(t, item, busy, run), 6)),
        panel(t('sections.highRiskAlerts'), list(highRisk, renderPerception, 6)),
        panel(t('sections.decisionEffects'), list(meta.effects || [], renderEffect, 6))
      ),
      h('section', { className: 'so-grid two' }, panel(t('sections.recentRuns'), list(meta.runs || [], renderRun, 8)), panel(t('sections.recentToolRuns'), list(meta.logs || [], renderLog, 8)))
    )
  }

  function renderGraph(t, graph, selectedNodeId, detailTab, setDetailTab, graphType, changeGraphType, zoom, setZoom, selectNode) {
    const nodes = graph.nodes || []
    const edges = graph.edges || []
    const objectTypes = unique(nodes.map((node) => node.objectType).filter(Boolean)).sort()
    const canvasNodes = graphType === 'all' ? nodes : nodes.filter((node) => node.objectType === graphType || node.entityTypeCode === graphType)
    const canvasNodeIds = new Set(canvasNodes.map((node) => node.id))
    const canvasEdges = edges.filter((edge) => canvasNodeIds.has(edge.source) && canvasNodeIds.has(edge.target))
    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || canvasNodes[0] || nodes[0]
    return h(
      'section',
      { className: 'so-graph-layout' },
      h(
        'aside',
        { className: 'so-panel so-legend' },
        h('h2', null, t('sections.graphLegend')),
        h(
          'select',
          { value: graphType, onChange: (event) => changeGraphType(event.target.value) },
          h('option', { value: 'all' }, t('graph.filterAll')),
          objectTypes.map((type) => h('option', { key: type, value: type }, type))
        ),
        h('div', { className: 'so-domain-list' }, (graph.domainGroups || []).map((group) => h('div', { className: 'so-domain', key: group.key }, h('strong', null, group.key), h('span', null, (group.objectTypes || []).join(', '))))),
        h('p', { className: 'so-muted' }, graph.configured ? '' : t('configureOntology'))
      ),
      h(
        'section',
        { className: 'so-panel so-graph-panel' },
        h(
          'div',
          { className: 'so-panel-head' },
          h('h2', null, t('sections.graphCanvas')),
          h(
            'div',
            { className: 'so-toolbar compact' },
            h('button', { className: 'so-button', onClick: () => setZoom(Math.min(1.8, zoom + 0.15)) }, t('graph.zoomIn')),
            h('button', { className: 'so-button', onClick: () => setZoom(Math.max(0.55, zoom - 0.15)) }, t('graph.zoomOut')),
            h('button', { className: 'so-button', onClick: () => setZoom(1) }, Math.round(zoom * 100) + '%')
          )
        ),
        h('p', { className: 'so-hint' }, t('graph.clickHint')),
        canvasNodes.length
          ? renderGraphCanvas(t, canvasNodes, canvasEdges, selectedNodeId, zoom, selectNode)
          : h('div', { className: 'so-empty' }, graph.error || t('noGraph'))
      ),
      h('aside', { className: 'so-panel so-detail' }, renderNodeDetail(t, selectedNode, edges, detailTab, setDetailTab, graph))
    )
  }

  function renderGraphCanvas(t, nodes, edges, selectedNodeId, zoom, selectNode) {
    const layout = buildGraphLayout(nodes.slice(0, 80), edges, selectedNodeId)
    const selectedEdges = new Set(
      layout.edges.filter((edge) => edge.source === selectedNodeId || edge.target === selectedNodeId).map((edge) => edge.id)
    )
    const scale = Math.max(0.55, Math.min(1.8, zoom || 1))
    const transform = 'translate(' + layout.width / 2 + ' ' + layout.height / 2 + ') scale(' + scale + ') translate(' + -layout.width / 2 + ' ' + -layout.height / 2 + ')'
    return h(
      'div',
      { className: 'so-graph-canvas' },
      h(
        'svg',
        {
          className: 'so-graph-svg',
          viewBox: '0 0 ' + layout.width + ' ' + layout.height,
          role: 'img',
          'aria-label': t('sections.graphCanvas')
        },
        h(
          'defs',
          null,
          h('marker', { id: 'so-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }, h('path', { d: 'M 0 0 L 10 5 L 0 10 z' }))
        ),
        h(
          'g',
          { transform },
          h(
            'g',
            { className: 'so-svg-edges' },
            layout.edges.map((edge) =>
              h(
                'g',
                { key: edge.id || edge.source + ':' + edge.target },
                h('line', {
                  className: 'so-svg-edge ' + (selectedEdges.has(edge.id) ? 'active' : ''),
                  x1: edge.x1,
                  y1: edge.y1,
                  x2: edge.x2,
                  y2: edge.y2
                }),
                h('text', { className: 'so-svg-edge-label', x: edge.labelX, y: edge.labelY, textAnchor: 'middle' }, truncate(edge.relationType || 'LINK', 18))
              )
            )
          ),
          h(
            'g',
            { className: 'so-svg-nodes' },
            layout.nodes.map((item) =>
              h(
                'g',
                {
                  key: item.node.id,
                  className: 'so-svg-node ' + (selectedNodeId === item.node.id ? 'active' : ''),
                  transform: 'translate(' + (item.x - item.width / 2) + ' ' + (item.y - item.height / 2) + ')',
                  tabIndex: 0,
                  role: 'button',
                  onClick: () => selectNode(item.node),
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectNode(item.node)
                    }
                  }
                },
                h('title', null, item.node.label || item.node.externalKey || item.node.id),
                h('rect', { width: item.width, height: item.height, rx: 22, ry: 22 }),
                h(
                  'text',
                  { x: item.width / 2, y: 22, textAnchor: 'middle' },
                  h('tspan', { x: item.width / 2 }, truncate(item.node.label || item.node.externalKey || 'Object', 13)),
                  h('tspan', { className: 'so-svg-node-type', x: item.width / 2, dy: 15 }, truncate(item.node.objectType || item.node.entityTypeCode || 'Object', 16))
                )
              )
            )
          )
        )
      )
    )
  }

  function renderNodeDetail(t, node, edges, detailTab, setDetailTab, graph) {
    if (!node) {
      return h('div', { className: 'so-empty' }, t('noRecords'))
    }
    const relatedEdges = edges.filter((edge) => edge.source === node.id || edge.target === node.id)
    return h(
      React.Fragment,
      null,
      h('div', { className: 'so-detail-title' }, h('h2', null, node.label || node.externalKey), h('span', { className: 'so-pill neutral' }, node.objectType || node.entityTypeCode || 'Object')),
      h(
        'div',
        { className: 'so-subtabs' },
        DETAIL_TABS.map((tab) => h('button', { key: tab, className: detailTab === tab ? 'active' : '', onClick: () => setDetailTab(tab) }, t('detail.' + tab)))
      ),
      detailTab === 'attributes' && keyValueTable(Object.assign({}, node.properties || {}, node.attributes || {}, { state: node.state, riskScore: pct(node.riskScore) })),
      detailTab === 'relations' && list(relatedEdges, (edge) => renderRelation(edge, node), 12),
      detailTab === 'actions' && list(((graph || {}).neighborhood || {}).actions || [], renderJsonRow, 8),
      detailTab === 'influence' && keyValueTable({ riskScore: pct(node.riskScore), source: node.source, connectedRelations: relatedEdges.length }),
      detailTab === 'implicit' && list(relatedEdges.filter((edge) => /IMPLICIT|PEER|TARGET|PROPOSE/i.test(edge.relationType || '')), renderJsonRow, 8)
    )
  }

  function renderInsights(t, items, meta, insightType, changeInsightType) {
    const all = meta.insightItems || []
    return h(
      'section',
      { className: 'so-stack' },
      h(
        'div',
        { className: 'so-filter-tabs' },
        INSIGHT_TYPES.map((type) =>
          h('button', { key: type, className: insightType === type ? 'active' : '', onClick: () => changeInsightType(type) }, t('insights.' + type), h('span', null, countInsightType(all, type)))
        )
      ),
      panel(t('sections.insightStream'), list(items.length ? items : meta.filteredInsightItems || [], renderInsight, 30))
    )
  }

  function renderRules(t, items, meta, busy, run) {
    return h(
      'section',
      { className: 'so-stack' },
      h('div', { className: 'so-toolbar' }, controlButton(t('runReasoning'), 'run_reasoning', busy, () => run('run_reasoning', { reasoningType: 'multi_step' }))),
      h('section', { className: 'so-grid two' }, panel(t('sections.ruleLibrary'), list(items.length ? items : meta.ruleItems || [], renderRule, 20)), panel(t('sections.reasoningRuns'), list((meta.runs || []).filter((run) => run.runType === 'reasoning'), renderRun, 12)))
    )
  }

  function renderScenarios(t, items, meta, busy, run) {
    const firstScenario = (meta.scenarios || [])[0]
    return h(
      'section',
      { className: 'so-stack' },
      h('div', { className: 'so-toolbar' }, controlButton(t('simulateScenario'), 'simulate_scenario', busy, () => run('simulate_scenario', defaultScenarioInput()))),
      h(
        'section',
        { className: 'so-grid two' },
        panel(t('sections.scenarioList'), list(items.length ? items : meta.scenarios || [], renderScenario, 20)),
        panel(t('sections.decisionRecommendation'), firstScenario ? renderScenarioRecommendation(firstScenario) : h('div', { className: 'so-empty' }, t('noRecords')))
      ),
      panel(t('sections.executionPaths'), renderExecutionPaths())
    )
  }

  function renderAssistant(t, items, meta, busy, sendToAssistant) {
    return h(
      'section',
      { className: 'so-grid two' },
      panel(
        t('sections.quickQuestions'),
        h(
          'div',
          { className: 'so-quick-list' },
          QUICK_QUESTIONS.map((item) =>
            h('button', { key: item.key, className: 'so-quick', disabled: busy === 'assistant.chat.send_message', onClick: () => sendToAssistant(item.text) }, h('strong', null, t(item.label)), h('span', null, t(item.text)))
          )
        )
      ),
      panel(t('sections.assistantContext'), list(items.length ? items : meta.assistantItems || [], renderAssistantItem, 18))
    )
  }

  function renderTools(t, items, meta) {
    const toolStatus = meta.toolStatus || {}
    return h(
      'section',
      { className: 'so-stack' },
      h('section', { className: 'so-grid three' }, metric(t('sections.toolStatus'), (items || []).length), metric(t('sections.reasoningTypes'), (toolStatus.implementedReasoningTypes || []).length), metric(t('sections.executableActions'), (toolStatus.executableActions || []).length)),
      h(
        'section',
        { className: 'so-grid two' },
        panel(t('sections.toolStatus'), list(items.length ? items : toolStatus.items || [], renderTool, 20)),
        panel(t('sections.executableActions'), list(toolStatus.executableActions || [], renderActionDefinition, 20))
      ),
      panel(t('sections.reasoningTypes'), h('div', { className: 'so-chip-list' }, (toolStatus.implementedReasoningTypes || []).map((item) => h('span', { key: item, className: 'so-chip' }, item))))
    )
  }

  function controlButton(label, key, busy, onClick) {
    return h('button', { className: 'so-button', disabled: busy && busy.startsWith(key), onClick }, busy && busy.startsWith(key) ? label + '...' : label)
  }

  function metric(label, value) {
    return h('div', { className: 'so-metric' }, h('span', null, label), h('strong', null, String(value || 0)))
  }

  function panel(title, content) {
    return h('section', { className: 'so-panel' }, h('h2', null, title), content)
  }

  function list(items, render, limit) {
    const rows = (items || []).slice(0, limit || 12)
    if (!rows.length) {
      return h('div', { className: 'so-empty' }, translate(currentLocale, 'noRecords'))
    }
    return h('div', { className: 'so-list' }, rows.map(render))
  }

  function renderPerception(item) {
    const alert = ((item.alerts || [])[0] || {}).message
    return h(
      'article',
      { className: 'so-row', key: item.id || item.entityExternalKey },
      h('div', null, h('strong', null, item.entityName || item.entityExternalKey || 'Object'), h('span', null, item.entityObjectType || item.entityTypeCode || item.state)),
      h('b', { className: 'so-risk ' + riskClass(item.riskScore) }, pct(item.riskScore)),
      h('small', null, alert || item.state || '')
    )
  }

  function renderProposal(t, item, busy, run) {
    const targetId = item.id
    return h(
      'article',
      { className: 'so-row proposal', key: item.id || item.title },
      h('div', null, h('strong', null, item.title || 'Proposal'), h('span', null, item.entityName || item.entityExternalKey || item.actionType)),
      h('b', { className: 'so-pill ' + statusClass(item.status) }, item.status || 'pending'),
      h('small', null, item.description || ''),
      h(
        'div',
        { className: 'so-row-actions' },
        h('button', { disabled: !targetId || busy, onClick: () => run('approve_proposal', {}, targetId) }, t('approve')),
        h('button', { disabled: !targetId || busy, onClick: () => run('reject_proposal', {}, targetId) }, t('reject')),
        h('button', { disabled: !targetId || busy, onClick: () => run('execute_proposal', {}, targetId) }, t('execute'))
      )
    )
  }

  function renderEffect(item) {
    return h('article', { className: 'so-row', key: item.id || item.decisionId || item.metricName }, h('div', null, h('strong', null, item.metricName || 'Effect'), h('span', null, item.decisionType || item.decisionId || 'decision')), h('b', { className: 'so-pill ' + statusClass(item.status) }, item.status || 'unknown'), h('small', null, `${item.actualValue ?? '-'} / ${item.expectedValue ?? '-'} ${item.unit || ''}`))
  }

  function renderRun(item) {
    return h('article', { className: 'so-row', key: item.id || item.createdAt }, h('div', null, h('strong', null, item.runType || item.title || 'Run'), h('span', null, formatDate(item.createdAt))), h('b', { className: 'so-pill ' + statusClass(item.status) }, item.status || 'completed'), h('small', null, textSummary(item.output || item.source || item)))
  }

  function renderLog(item) {
    return h('article', { className: 'so-row', key: item.id || item.createdAt }, h('div', null, h('strong', null, item.toolName || item.actionName || 'Tool'), h('span', null, formatDate(item.createdAt))), h('b', { className: 'so-pill ' + statusClass(item.status) }, item.status || 'success'), h('small', null, textSummary(item.result || item.parameters || item)))
  }

  function renderInsight(item) {
    return h('article', { className: 'so-row', key: item.id || item.title }, h('div', null, h('strong', null, item.title || 'Insight'), h('span', null, item.kind || item.category || 'insight')), h('b', { className: 'so-pill ' + statusClass(item.priority || item.category) }, pct(item.confidence)), h('small', null, item.description || textSummary(item.source || item)))
  }

  function renderRule(item) {
    return h('article', { className: 'so-row', key: item.id || item.title }, h('div', null, h('strong', null, item.title || item.reasoningType || 'Rule'), h('span', null, item.domain || item.kind || item.status)), h('b', { className: 'so-pill neutral' }, pct(item.confidence)), h('small', null, item.description || textSummary(item.source || item)))
  }

  function renderScenario(item) {
    return h('article', { className: 'so-row', key: item.id || item.name }, h('div', null, h('strong', null, item.name || 'Scenario'), h('span', null, item.category || item.scenarioType || 'forecast')), h('b', { className: 'so-pill ' + statusClass(item.riskLevel) }, item.riskLevel || pct((item.achievementRate || 0) / 100)), h('small', null, `${item.forecastValue ?? 0} / ${item.targetValue ?? 0}, ${item.achievementRate ?? '-'}%`))
  }

  function renderScenarioRecommendation(item) {
    return h('div', { className: 'so-recommendation' }, h('strong', null, item.name || 'Scenario'), h('p', null, item.description || translate(currentLocale, 'recommendationFallback')), keyValueTable({ forecastValue: item.forecastValue, targetValue: item.targetValue, achievementRate: item.achievementRate, riskLevel: item.riskLevel }))
  }

  function renderExecutionPaths() {
    const paths = [
      { name: translate(currentLocale, 'paths.aggressive'), duration: '15d', success: '75%', roi: '2.5x' },
      { name: translate(currentLocale, 'paths.conservative'), duration: '56d', success: '90%', roi: '1.8x' },
      { name: translate(currentLocale, 'paths.balanced'), duration: '30d', success: '82%', roi: '2.1x' }
    ]
    return h('div', { className: 'so-paths' }, paths.map((path) => h('article', { className: 'so-path', key: path.name }, h('strong', null, path.name), h('span', null, path.duration), h('span', null, path.success), h('span', null, path.roi))))
  }

  function renderAssistantItem(item) {
    return h('article', { className: 'so-row', key: (item.source || item).id || item.title }, h('div', null, h('strong', null, item.title || item.kind || 'Context'), h('span', null, item.kind || 'assistant')), h('b', { className: 'so-pill neutral' }, item.kind || 'item'), h('small', null, textSummary(item.source || item)))
  }

  function renderTool(item) {
    return h('article', { className: 'so-row', key: item.key || item.title }, h('div', null, h('strong', null, item.title || item.key), h('span', null, item.group || 'tool')), h('b', { className: 'so-pill ' + statusClass(item.status) }, item.status || 'available'), h('small', null, item.key || ''))
  }

  function renderActionDefinition(item) {
    return h('article', { className: 'so-row', key: item.code || item.name }, h('div', null, h('strong', null, item.name || item.code), h('span', null, item.code || 'action')), h('b', { className: 'so-pill ' + statusClass(item.riskLevel) }, item.riskLevel || 'LOW'), h('small', null, item.requiresApproval ? translate(currentLocale, 'requiresApproval') : translate(currentLocale, 'directExecution')))
  }

  function renderRelation(edge, node) {
    const other = edge.source === node.id ? edge.target : edge.source
    return h('article', { className: 'so-row', key: edge.id || other }, h('div', null, h('strong', null, edge.relationType || 'Relation'), h('span', null, other)), h('b', { className: 'so-pill neutral' }, pct(edge.confidence)), h('small', null, textSummary(edge)))
  }

  function renderJsonRow(item) {
    return h('article', { className: 'so-row', key: item.id || item.code || item.name || JSON.stringify(item).slice(0, 40) }, h('div', null, h('strong', null, item.name || item.title || item.code || item.relationType || 'Item'), h('span', null, item.status || item.kind || item.riskLevel || '')), h('b', { className: 'so-pill neutral' }, pct(item.confidence)), h('small', null, textSummary(item)))
  }

  function keyValueTable(record) {
    const entries = Object.entries(record || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
    if (!entries.length) return h('div', { className: 'so-empty' }, translate(currentLocale, 'noRecords'))
    return h('dl', { className: 'so-kv' }, entries.slice(0, 20).flatMap(([key, value]) => [h('dt', { key: key + ':k' }, key), h('dd', { key: key + ':v' }, typeof value === 'object' ? textSummary(value) : String(value))]))
  }

  function buildQuery(context, patch) {
    const payload = (context && context.payload) || {}
    const initialQuery = (context && context.initialQuery) || {}
    const next = Object.assign({ page: 1, pageSize: 30 }, initialQuery, patch || {})
    next.parameters = Object.assign({}, payload.parameters || {}, initialQuery.parameters || {}, next.parameters || {})
    return next
  }

  function defaultScenarioInput() {
    return {
      name: 'Sales Ontology scenario',
      scenarioType: 'forecast',
      category: 'sales_strategy',
      targetValue: 100,
      forecastValue: 85,
      delta: 8,
      params: {
        visitFrequency: 20,
        budgetShift: 10
      }
    }
  }

  function normalizeLocale(locale) {
    const value = String(locale || navigator.language || '').toLowerCase()
    return value.startsWith('zh') ? 'zh_Hans' : 'en_US'
  }

  function translate(locale, key, params) {
    const dictionary = COPY[locale] || COPY.en_US
    const fallback = COPY.en_US
    const value = readPath(dictionary, key) || readPath(fallback, key) || key
    return String(value).replace(/\{\{(\w+)\}\}/g, (_, name) => String((params || {})[name] ?? ''))
  }

  function readPath(source, key) {
    return key.split('.').reduce((value, part) => (value && value[part] !== undefined ? value[part] : undefined), source)
  }

  function resolveText(value, fallback, locale) {
    if (typeof value === 'string') return value
    if (!isObject(value)) return fallback
    return value[locale] || value.zh_Hans || value.en_US || fallback
  }

  function pct(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
    const normalized = value > 1 ? value : value * 100
    return Math.round(normalized) + '%'
  }

  function statusClass(value) {
    const status = String(value || '').toLowerCase()
    if (/critical|high|failed|rejected|risk|missed/.test(status)) return 'danger'
    if (/medium|pending|running|warning/.test(status)) return 'warning'
    if (/approved|executed|success|available|recent|low|configured/.test(status)) return 'success'
    return 'neutral'
  }

  function riskClass(value) {
    if (value >= 0.7) return 'danger'
    if (value >= 0.4) return 'warning'
    return 'success'
  }

  function truncate(value, length) {
    const text = String(value || '')
    return text.length > length ? text.slice(0, length - 1) + '...' : text
  }

  function textSummary(value) {
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    try {
      return truncate(JSON.stringify(value), 180)
    } catch {
      return String(value)
    }
  }

  function formatDate(value) {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }

  function unique(items) {
    return Array.from(new Set(items))
  }

  function countInsightType(items, type) {
    if (type === 'all') return items.length
    return items.filter((item) => item.category === type).length
  }

  function buildGraphLayout(nodes, edges, selectedNodeId) {
    const width = 900
    const height = 560
    const centerX = width / 2
    const centerY = height / 2
    const indexById = new Map(nodes.map((node, index) => [node.id, index]))
    const visibleEdges = edges
      .filter((edge) => indexById.has(edge.source) && indexById.has(edge.target))
      .slice(0, 180)
    const degree = new Map()
    visibleEdges.forEach((edge) => {
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
    })
    const ordered = nodes
      .map((node, originalIndex) => ({ node, originalIndex, degree: degree.get(node.id) || 0 }))
      .sort((a, b) => {
        if (a.node.id === selectedNodeId) return -1
        if (b.node.id === selectedNodeId) return 1
        return b.degree - a.degree || a.originalIndex - b.originalIndex
      })
    const models = ordered.map((item, index) => {
      const hash = hashText(String(item.node.id || item.node.externalKey || index))
      const angle = (hash % 628) / 100
      const ring = Math.floor(index / 12)
      const radius = index === 0 && item.node.id === selectedNodeId ? 8 : 80 + ring * 62 + (hash % 35)
      return {
        node: item.node,
        width: 118,
        height: 58,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
        vx: 0,
        vy: 0
      }
    })
    const modelById = new Map(models.map((model) => [model.node.id, model]))
    for (let tick = 0; tick < 70; tick += 1) {
      for (let i = 0; i < models.length; i += 1) {
        for (let j = i + 1; j < models.length; j += 1) {
          const a = models[i]
          const b = models[j]
          const dx = b.x - a.x || 0.01
          const dy = b.y - a.y || 0.01
          const distanceSquared = dx * dx + dy * dy
          const force = Math.min(2.4, 4200 / Math.max(900, distanceSquared))
          const distance = Math.sqrt(distanceSquared)
          const fx = (dx / distance) * force
          const fy = (dy / distance) * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }
      visibleEdges.forEach((edge) => {
        const source = modelById.get(edge.source)
        const target = modelById.get(edge.target)
        if (!source || !target) return
        const dx = target.x - source.x
        const dy = target.y - source.y
        const distance = Math.sqrt(dx * dx + dy * dy) || 1
        const desired = 135
        const force = (distance - desired) * 0.018
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force
        source.vx += fx
        source.vy += fy
        target.vx -= fx
        target.vy -= fy
      })
      models.forEach((model) => {
        const centerStrength = model.node.id === selectedNodeId ? 0.06 : 0.012
        model.vx += (centerX - model.x) * centerStrength
        model.vy += (centerY - model.y) * centerStrength
        model.vx *= 0.72
        model.vy *= 0.72
        model.x = clamp(model.x + model.vx, 70, width - 70)
        model.y = clamp(model.y + model.vy, 45, height - 45)
      })
    }
    const layoutEdges = visibleEdges.map((edge, index) => {
      const source = modelById.get(edge.source)
      const target = modelById.get(edge.target)
      const start = edgeEndpoint(source, target)
      const end = edgeEndpoint(target, source)
      const curveOffset = ((index % 3) - 1) * 8
      return {
        ...edge,
        id: edge.id || edge.source + ':' + edge.target + ':' + index,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        labelX: (start.x + end.x) / 2 + curveOffset,
        labelY: (start.y + end.y) / 2 + curveOffset
      }
    })
    return { width, height, nodes: models, edges: layoutEdges }
  }

  function edgeEndpoint(from, to) {
    if (!from || !to) return { x: 0, y: 0 }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const halfW = from.width / 2 + 4
    const halfH = from.height / 2 + 4
    const scale = 1 / Math.sqrt((dx * dx) / (halfW * halfW) + (dy * dy) / (halfH * halfH) || 1)
    return { x: from.x + dx * scale, y: from.y + dy * scale }
  }

  function hashText(text) {
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value))
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
:root {
  color-scheme: inherit;
  --so-surface: var(--xui-color-card, Canvas);
  --so-surface-foreground: var(--xui-color-card-foreground, var(--xui-color-foreground, CanvasText));
  --so-border: var(--xui-color-border, GrayText);
  --so-border-strong: color-mix(in srgb, var(--xui-color-border, GrayText) 70%, var(--xui-color-foreground, CanvasText));
  --so-text: var(--xui-color-foreground, CanvasText);
  --so-muted: var(--xui-color-muted-foreground, GrayText);
  --so-primary: var(--xui-color-primary, Highlight);
  --so-danger: var(--xui-color-destructive, var(--xui-color-foreground, CanvasText));
  --so-warning: var(--xui-color-warning, var(--xui-color-destructive, var(--xui-color-foreground, CanvasText)));
  --so-success: var(--xui-color-success, var(--xui-color-foreground, CanvasText));
  --so-danger-border: color-mix(in srgb, var(--so-danger) 36%, var(--so-border));
  --so-warning-border: color-mix(in srgb, var(--so-warning) 36%, var(--so-border));
  --so-success-border: color-mix(in srgb, var(--so-success) 36%, var(--so-border));
  --so-edge-label-stroke: var(--xui-color-card, Canvas);
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; font-family: var(--xui-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); background: transparent; color: var(--so-text); }
button, input, select { font: inherit; letter-spacing: 0; }
.so-shell { min-height: 100vh; padding: 16px; background: transparent; }
.so-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 12px; }
.so-title h1 { margin: 0 0 4px; font-size: 24px; line-height: 1.15; letter-spacing: 0; }
.so-title p { margin: 0; color: var(--so-muted); font-size: 13px; line-height: 1.45; }
.so-toolbar, .so-row-actions, .so-pagination-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.so-toolbar.compact { gap: 6px; }
.so-button, .so-row-actions button { min-height: 34px; border-radius: var(--xui-radius-sm, 7px); border: 1px solid var(--so-border); background: var(--so-surface); color: var(--so-surface-foreground); padding: 0 12px; font-weight: 700; cursor: pointer; }
.so-button:hover, .so-row-actions button:hover { border-color: var(--so-primary); color: var(--so-primary); }
.so-button:disabled, .so-row-actions button:disabled { opacity: .5; cursor: not-allowed; }
.so-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--so-border); margin-bottom: 12px; }
.so-tab { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--so-muted); padding: 10px 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.so-tab.active { color: var(--so-text); border-color: var(--so-primary); }
.so-searchbar { display: flex; gap: 8px; margin-bottom: 12px; }
.so-searchbar input, .so-legend select { width: 100%; min-height: 36px; border-radius: var(--xui-radius-sm, 7px); border: 1px solid var(--so-border); background: var(--so-surface); color: var(--so-surface-foreground); padding: 0 10px; }
.so-stack { display: flex; flex-direction: column; gap: 12px; }
.so-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
.so-metric { min-height: 72px; border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 8px); padding: 12px; background: var(--so-surface); display: flex; flex-direction: column; justify-content: space-between; }
.so-metric span { color: var(--so-muted); font-size: 12px; font-weight: 800; }
.so-metric strong { font-size: 26px; line-height: 1; letter-spacing: 0; }
.so-grid { display: grid; gap: 12px; }
.so-grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.so-grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.so-panel { min-width: 0; border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 8px); background: var(--so-surface); color: var(--so-surface-foreground); padding: 12px; }
.so-panel h2 { margin: 0 0 10px; font-size: 15px; line-height: 1.2; letter-spacing: 0; }
.so-panel-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.so-list { display: flex; flex-direction: column; gap: 8px; }
.so-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 7px 10px; border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 7px); background: var(--so-surface); color: var(--so-surface-foreground); padding: 10px; min-width: 0; }
.so-row strong, .so-row span, .so-row small { min-width: 0; overflow-wrap: anywhere; }
.so-row strong { display: block; font-size: 13px; line-height: 1.25; }
.so-row span { display: block; color: var(--so-muted); font-size: 12px; margin-top: 2px; }
.so-row small { grid-column: 1 / -1; color: var(--so-muted); line-height: 1.35; }
.so-row.proposal { grid-template-columns: minmax(0, 1fr) auto; }
.so-row-actions { grid-column: 1 / -1; }
.so-risk, .so-pill { align-self: start; border-radius: 999px; padding: 3px 8px; font-size: 12px; line-height: 1.2; white-space: nowrap; border: 1px solid var(--so-border); background: var(--so-surface); }
.so-risk.danger, .so-pill.danger { color: var(--so-danger); border-color: var(--so-danger-border); }
.so-risk.warning, .so-pill.warning { color: var(--so-warning); border-color: var(--so-warning-border); }
.so-risk.success, .so-pill.success { color: var(--so-success); border-color: var(--so-success-border); }
.so-pill.neutral { color: var(--so-muted); }
.so-empty, .so-loading { min-height: 150px; display: flex; align-items: center; justify-content: center; color: var(--so-muted); border: 1px dashed var(--so-border); border-radius: var(--xui-radius-sm, 8px); background: transparent; text-align: center; padding: 16px; }
.so-notice { margin-bottom: 12px; padding: 10px 12px; border-radius: var(--xui-radius-sm, 7px); border: 1px solid var(--so-border); background: var(--so-surface); font-size: 13px; font-weight: 700; }
.so-notice.success { color: var(--so-success); border-color: var(--so-success-border); }
.so-notice.error { color: var(--so-danger); border-color: var(--so-danger-border); }
.so-pagination { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; color: var(--so-muted); font-size: 13px; border-top: 1px solid var(--so-border); padding-top: 12px; }
.so-graph-layout { display: grid; grid-template-columns: 220px minmax(0, 1fr) 340px; gap: 12px; align-items: stretch; }
.so-legend, .so-detail { align-self: start; }
.so-domain-list { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; max-height: 520px; overflow: auto; }
.so-domain { border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 7px); padding: 8px; }
.so-domain strong { display: block; font-size: 12px; }
.so-domain span, .so-muted, .so-hint { color: var(--so-muted); font-size: 12px; line-height: 1.4; }
.so-graph-panel { min-height: 620px; }
.so-graph-canvas { position: relative; min-height: 530px; overflow: hidden; border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 8px); background: transparent; }
.so-graph-svg { display: block; width: 100%; height: 560px; }
.so-graph-svg marker path { fill: var(--so-border-strong); }
.so-svg-edge { stroke: var(--so-border-strong); stroke-width: 1.6; opacity: .76; marker-end: url(#so-arrow); }
.so-svg-edge.active { stroke: var(--so-primary); stroke-width: 2.3; opacity: 1; }
.so-svg-edge-label { fill: var(--so-muted); font-size: 10px; font-weight: 800; paint-order: stroke; stroke: var(--so-edge-label-stroke); stroke-width: 4px; stroke-linejoin: round; }
.so-svg-node { cursor: pointer; outline: none; }
.so-svg-node rect { fill: var(--so-surface); stroke: var(--so-border-strong); stroke-width: 1.8; transition: stroke .15s ease, stroke-width .15s ease; }
.so-svg-node:hover rect, .so-svg-node.active rect, .so-svg-node:focus rect { stroke: var(--so-primary); stroke-width: 2.6; }
.so-svg-node text { fill: var(--so-text); font-size: 12px; font-weight: 900; pointer-events: none; }
.so-svg-node.active text { fill: var(--so-primary); }
.so-svg-node-type { fill: var(--so-muted); font-size: 10px; font-weight: 800; }
.so-detail-title { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.so-subtabs, .so-filter-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--so-border); margin-bottom: 10px; }
.so-subtabs button, .so-filter-tabs button { border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--so-muted); padding: 8px 9px; font-weight: 800; cursor: pointer; white-space: nowrap; }
.so-subtabs button.active, .so-filter-tabs button.active { color: var(--so-text); border-color: var(--so-primary); }
.so-filter-tabs span { margin-left: 6px; color: var(--so-muted); }
.so-kv { display: grid; grid-template-columns: minmax(90px, .4fr) minmax(0, 1fr); gap: 7px 10px; margin: 0; }
.so-kv dt { color: var(--so-muted); font-size: 12px; font-weight: 800; }
.so-kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; font-size: 12px; }
.so-quick-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.so-quick { text-align: left; border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 8px); padding: 10px; background: var(--so-surface); color: var(--so-surface-foreground); cursor: pointer; }
.so-quick strong { display: block; margin-bottom: 4px; }
.so-quick span { color: var(--so-muted); font-size: 12px; line-height: 1.4; }
.so-recommendation p { color: var(--so-muted); line-height: 1.5; }
.so-paths { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.so-path { border: 1px solid var(--so-border); border-radius: var(--xui-radius-sm, 8px); padding: 12px; display: grid; gap: 6px; }
.so-chip-list { display: flex; flex-wrap: wrap; gap: 8px; }
.so-chip { border: 1px solid var(--so-border); border-radius: 999px; padding: 5px 9px; font-size: 12px; color: var(--so-muted); }
@media (max-width: 1120px) {
  .so-grid.two, .so-grid.three, .so-graph-layout { grid-template-columns: 1fr; }
  .so-graph-panel { min-height: 520px; }
}
@media (max-width: 720px) {
  .so-shell { padding: 12px; }
  .so-header { flex-direction: column; }
  .so-kpis, .so-quick-list, .so-paths { grid-template-columns: 1fr; }
  .so-searchbar, .so-pagination { align-items: stretch; flex-direction: column; }
}
`
    document.head.appendChild(style)
  }

  const root = ReactDOM.createRoot(document.getElementById('root'))
  root.render(h(App))
  post('ready')
})()
