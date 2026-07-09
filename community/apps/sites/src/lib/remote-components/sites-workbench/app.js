;(function () {
  const CHANNEL = 'xpertai.remote_component'
  const VERSION = 1
  const BROWSER_PREVIEW_EVENT_TYPE = 'workbench.browser.preview'
  const SITES_PLUGIN_NAME = '@xpert-ai/plugin-sites'
  const WORKBENCH_BROWSER_OPEN_CLIENT_COMMAND = 'workbench.browser.open'
  const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'
  const SITE_TEMPLATE_KEYS = ['onboardingHub', 'enablementHub', 'pulseDashboard', 'sparkboard', 'launchCal', 'eventPlanningHub']
  const TEMPLATE_PREVIEW_IMAGES = globalThis.__XPERT_SITES_TEMPLATE_PREVIEWS__ || {}
  const TEMPLATE_PROMPTS = Array.isArray(globalThis.__XPERT_SITES_TEMPLATE_PROMPTS__) ? globalThis.__XPERT_SITES_TEMPLATE_PROMPTS__ : []
  const h = React.createElement
  let instanceId = null
  let requestSequence = 0
  const pending = new Map()
  const COPY = {
    en_US: {
      sites: 'Sites',
      title: 'Sites Workbench',
      refresh: 'Refresh',
      loading: 'Loading...',
      loadFailed: 'Load failed',
      remoteRequestFailed: 'Remote request failed',
      actionDone: 'Done',
      actionFailed: 'Action failed',
      deployedSites: 'Deployed Sites',
      site: 'Site',
      sharedWith: 'Shared with',
      settings: 'Settings',
      templates: {
        title: 'Templates',
        subtitle: 'Pull up ready-made site patterns',
        expand: 'Show templates',
        collapse: 'Hide templates',
        prompt: 'Prompt',
        builtWith: 'Built with',
        model: 'Model',
        techStack: 'Tech stack',
        useCase: 'Use case',
        type: 'Type',
        copyPrompt: 'Copy prompt',
        copied: 'Prompt copied',
        try: 'Try',
        trying: 'Sending...',
        sent: 'Prompt sent to Assistant',
        sendFailed: 'Assistant ChatKit did not accept the prompt.',
        close: 'Close template prompt',
        items: {
          onboardingHub: {
            title: 'Onboarding Hub',
            description: 'A first-week onboarding dashboard with progress, meetings, tasks, and resources.'
          },
          enablementHub: {
            title: 'Enablement Hub',
            description: 'A searchable enablement library with featured learning paths, updates, and guides.'
          },
          pulseDashboard: {
            title: 'Pulse Dashboard',
            description: 'An executive KPI dashboard with trends, targets, metric health, and drill-ins.'
          },
          sparkboard: {
            title: 'Sparkboard',
            description: 'An employee idea board for sharing, voting, filtering, and ranking proposals.'
          },
          launchCal: {
            title: 'Launch Cal',
            description: 'A product launch calendar with planning filters, risk signals, and detail panels.'
          },
          eventPlanningHub: {
            title: 'Event Planning Hub',
            description: 'An event operations hub for requests, templates, upcoming dates, and approvals.'
          }
        }
      },
      back: 'Back',
      yourWorkspace: 'Your workspace',
      ownersAndAdmins: 'Owner/Admins',
      peopleAndGroups: 'People and groups',
      groupCount: '{{count}} group',
      groupCountPlural: '{{count}} groups',
      projects: 'Projects',
      noProjects: 'No site projects',
      noDeployedSites: 'No deployed sites',
      projectMeta: '{{versions}} versions · {{deploys}} deploys',
      detailsLabel: 'Open details: {{title}}',
      time: {
        now: 'now',
        minutes: '{{count}}m',
        hours: '{{count}}h',
        days: '{{count}}d',
        months: '{{count}}mo'
      },
      labels: {
        name: 'Name',
        storage: 'Storage',
        access: 'Access',
        prompt: 'Prompt',
        sourcePath: 'Source path',
        version: 'Version',
        environment: 'Environment',
        d1: 'D1',
        r2: 'R2',
        status: 'Status',
        commit: 'Commit',
        digest: 'Digest',
        deployments: 'Deployments',
        versions: 'Versions',
        url: 'URL',
        key: 'Key',
        value: 'Value',
        secret: 'Secret'
      },
      defaults: {
        name: 'Project Request Dashboard',
        prompt:
          'Build a project request dashboard for an operations team. Let members submit requests, see ownership, update status, and filter by priority.',
        versionTitle: 'Saved version',
        updatedVersionTitle: 'Updated version'
      },
      options: {
        static: 'Static',
        d1: 'D1',
        r2: 'R2',
        d1_r2: 'D1 + R2',
        workspace_auth: 'Workspace Auth',
        admins_only: 'Owner/Admins',
        workspace_all: 'Workspace',
        custom: 'Custom'
      },
      status: {
        draft: 'Draft',
        archived: 'Archived',
        deployed: 'Deployed',
        version_saved: 'Version saved',
        failed: 'Failed'
      },
      buttons: {
        create: 'Create site',
        creating: 'Creating...',
        saveVersion: 'Save version',
        saving: 'Saving...',
        deployLatest: 'Deploy latest',
        deploying: 'Deploying...',
        save: 'Save',
        preview: 'Preview',
        openDetails: 'Open details'
      },
      placeholders: {
        versionPrompt: 'Describe the next saved version',
        envKey: 'KEY',
        envValue: 'value'
      },
      noDescription: 'No description',
      none: 'none',
      noRecords: 'No records',
      yes: 'yes',
      no: 'no',
      blank: 'Create a site to start.'
    },
    zh_Hans: {
      sites: 'Sites',
      title: '站点工作台',
      refresh: '刷新',
      loading: '正在加载...',
      loadFailed: '加载失败',
      remoteRequestFailed: '远程请求失败',
      actionDone: '操作已完成',
      actionFailed: '操作失败',
      deployedSites: '已部署站点',
      site: '站点',
      sharedWith: '共享给',
      settings: '设置',
      templates: {
        title: '模板',
        subtitle: '上拉查看可直接参考的站点模板',
        expand: '展开模板',
        collapse: '收起模板',
        prompt: '提示词',
        builtWith: '构建方式',
        model: '模型',
        techStack: '技术栈',
        useCase: '使用场景',
        type: '类型',
        copyPrompt: '复制提示词',
        copied: '提示词已复制',
        try: '试用',
        trying: '发送中...',
        sent: '提示词已发送给助手',
        sendFailed: 'Assistant ChatKit 未接受该提示词。',
        close: '关闭模板提示词',
        items: {
          onboardingHub: {
            title: 'Onboarding Hub',
            description: '首周入职看板，包含进度、会议、任务和资源入口。'
          },
          enablementHub: {
            title: 'Enablement Hub',
            description: '可搜索的赋能资料库，包含学习路径、更新和指南。'
          },
          pulseDashboard: {
            title: 'Pulse Dashboard',
            description: '高管 KPI 看板，展示趋势、目标、指标健康和详情。'
          },
          sparkboard: {
            title: 'Sparkboard',
            description: '员工想法看板，用于提交、投票、筛选和排序提案。'
          },
          launchCal: {
            title: 'Launch Cal',
            description: '产品发布日历，包含规划筛选、风险信号和详情面板。'
          },
          eventPlanningHub: {
            title: 'Event Planning Hub',
            description: '活动运营中心，管理请求、模板、日期和审批。'
          }
        }
      },
      back: '返回',
      yourWorkspace: '你的工作区',
      ownersAndAdmins: '所有者/管理员',
      peopleAndGroups: '成员和群组',
      groupCount: '{{count}} 个群组',
      groupCountPlural: '{{count}} 个群组',
      projects: '项目',
      noProjects: '暂无站点项目',
      noDeployedSites: '暂无已部署站点',
      projectMeta: '{{versions}} 个版本 · {{deploys}} 次发布',
      detailsLabel: '打开详情：{{title}}',
      time: {
        now: '刚刚',
        minutes: '{{count}}分',
        hours: '{{count}}时',
        days: '{{count}}天',
        months: '{{count}}月'
      },
      labels: {
        name: '名称',
        storage: '存储',
        access: '访问权限',
        prompt: '提示词',
        sourcePath: '源码目录',
        version: '版本',
        environment: '环境变量',
        d1: 'D1',
        r2: 'R2',
        status: '状态',
        commit: '提交',
        digest: '摘要',
        deployments: '发布',
        versions: '版本',
        url: 'URL',
        key: '键',
        value: '值',
        secret: '密钥'
      },
      defaults: {
        name: '项目请求看板',
        prompt: '为运营团队构建一个项目请求看板。让成员提交请求、查看负责人、更新状态，并按优先级筛选。',
        versionTitle: '保存的版本',
        updatedVersionTitle: '更新的版本'
      },
      options: {
        static: '静态',
        d1: 'D1',
        r2: 'R2',
        d1_r2: 'D1 + R2',
        workspace_auth: '工作区认证',
        admins_only: '所有者/管理员',
        workspace_all: '工作区',
        custom: '自定义'
      },
      status: {
        draft: '草稿',
        archived: '已归档',
        deployed: '已发布',
        version_saved: '版本已保存',
        failed: '失败'
      },
      buttons: {
        create: '创建站点',
        creating: '创建中...',
        saveVersion: '保存版本',
        saving: '保存中...',
        deployLatest: '发布最新版本',
        deploying: '发布中...',
        save: '保存',
        preview: '预览',
        openDetails: '打开详情'
      },
      placeholders: {
        versionPrompt: '描述下一次保存的版本',
        envKey: '键',
        envValue: '值'
      },
      noDescription: '暂无描述',
      none: '无',
      noRecords: '暂无记录',
      yes: '是',
      no: '否',
      blank: '创建一个站点开始。'
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

  function notify(level, message) {
    post('notify', { level, message })
  }

  function reportResize() {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 560)
    post('resize', { height, viewportBound: true })
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

  function buildQuery(context) {
    const payload = (context && context.payload) || {}
    const initialQuery = (context && context.initialQuery) || {}
    return Object.assign({ page: 1, pageSize: 30 }, initialQuery, {
      parameters: Object.assign({}, payload.parameters || {}, initialQuery.parameters || {})
    })
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

  function defaultDraft(locale) {
    return {
      name: translate(locale, 'defaults.name'),
      prompt: translate(locale, 'defaults.prompt'),
      storageShape: 'static',
      accessMode: 'admins_only'
    }
  }

  function resolveText(value, fallback, locale) {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object') {
      return value[locale] || value.zh_Hans || value.en_US || fallback
    }
    return fallback
  }

  function labelFromMap(locale, mapKey, value) {
    const normalized = String(value || '').trim()
    if (!normalized) return '-'
    const key = `${mapKey}.${normalized}`
    return readPath(COPY[locale] || COPY.en_US, key) || readPath(COPY.en_US, key) || normalized
  }

  function isDeploymentPreviewAction(actionKey) {
    return actionKey === 'create_site' || actionKey === 'deploy_version'
  }

  async function publishDeploymentPreview(result) {
    const event = readDeploymentPreviewEvent(result && result.data)
    if (!event) {
      return
    }

    await publishBrowserPreview(event)
  }

  async function openDeploymentPreview(url, data) {
    const displayUrl = readString(data || {}, 'displayUrl') || url
    const event = buildDeploymentPreviewEvent(Object.assign({}, data || {}, { url, displayUrl }))
    if (!event) {
      return
    }

    await publishBrowserPreview(event)
  }

  async function publishBrowserPreview(event) {
    try {
      await invokeClientCommand(WORKBENCH_BROWSER_OPEN_CLIENT_COMMAND, event)
    } catch (error) {
      if (window.console && typeof window.console.warn === 'function') {
        window.console.warn('[Sites] Preview event was not handled by the host.', error)
      }
    }
  }

  function readDeploymentPreviewEvent(data) {
    if (!isObject(data)) {
      return null
    }

    if (isDeploymentPreviewEvent(data.event)) {
      return normalizeDeploymentPreviewEvent(data.event)
    }

    return buildDeploymentPreviewEvent(data)
  }

  function isDeploymentPreviewEvent(value) {
    return (
      isObject(value) &&
      value.type === BROWSER_PREVIEW_EVENT_TYPE &&
      Boolean(readString(value, 'url') || readString(value, 'deploymentUrl') || readString(value, 'previewUrl'))
    )
  }

  function normalizeDeploymentPreviewEvent(value) {
    const url = readString(value, 'url') || readString(value, 'deploymentUrl') || readString(value, 'previewUrl') || readString(value, 'displayUrl')
    if (!url) {
      return null
    }
    return Object.assign({}, value, {
      type: BROWSER_PREVIEW_EVENT_TYPE,
      source: readString(value, 'source') || SITES_PLUGIN_NAME,
      url,
      displayUrl: readString(value, 'displayUrl') || url
    })
  }

  function buildDeploymentPreviewEvent(data) {
    const project = isObject(data.project) ? data.project : null
    const version = isObject(data.version) ? data.version : null
    const deployment = isObject(data.deployment) ? data.deployment : data
    const url =
      readString(data, 'url') ||
      readString(data, 'previewUrl') ||
      readString(data, 'deploymentUrl') ||
      readString(deployment, 'deploymentUrl') ||
      readString(data, 'displayUrl')
    if (!url) {
      return null
    }

    const event = {
      type: BROWSER_PREVIEW_EVENT_TYPE,
      source: SITES_PLUGIN_NAME,
      url,
      displayUrl: readString(data, 'displayUrl') || readString(data, 'deploymentUrl') || readString(deployment, 'deploymentUrl') || url
    }
    assignString(event, 'projectId', readString(data, 'projectId') || readString(deployment, 'projectId') || readString(project, 'id'))
    assignString(event, 'versionId', readString(data, 'versionId') || readString(deployment, 'versionId') || readString(version, 'id'))
    assignString(event, 'deploymentId', readString(data, 'deploymentId') || readString(deployment, 'id'))
    assignString(event, 'slug', readString(data, 'slug') || readString(project, 'slug'))
    assignString(event, 'status', readString(data, 'status') || readString(deployment, 'status'))
    assignString(event, 'accessMode', readString(data, 'accessMode') || readString(deployment, 'accessMode'))
    assignNumber(event, 'versionNumber', readNumber(data, 'versionNumber') || readNumber(version, 'versionNumber'))
    return event
  }

  function readString(value, key) {
    const item = value && value[key]
    return typeof item === 'string' && item.trim() ? item.trim() : ''
  }

  function readNumber(value, key) {
    const item = value && value[key]
    return typeof item === 'number' && Number.isFinite(item) ? item : undefined
  }

  function assignString(target, key, value) {
    if (value) {
      target[key] = value
    }
  }

  function assignNumber(target, key, value) {
    if (typeof value === 'number') {
      target[key] = value
    }
  }

  function getTemplatePromptItem(key, locale) {
    const item = TEMPLATE_PROMPTS.find((entry) => entry && entry.key === key)
    const fallbackPrompt = `Build a static internal site for the ${key} template. Create files under /workspace/sites/${String(key || 'site').replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`).replace(/^-/, '')}/ with a root index.html, then save and deploy it with the Sites tools.`
    const merged = Object.assign(
      {
        key,
        prompt: { en_US: fallbackPrompt },
        builtWith: { en_US: 'Sites in XpertAI', zh_Hans: 'XpertAI Sites' },
        model: 'GPT-5.5',
        techStack: { en_US: 'Static HTML/CSS/JS', zh_Hans: '静态 HTML/CSS/JS' },
        useCase: { en_US: 'Internal Tools', zh_Hans: '内部工具' },
        type: { en_US: 'App', zh_Hans: '应用' }
      },
      item || {}
    )
    return Object.assign({}, merged, {
      prompt: resolveI18nText(merged.prompt, locale, fallbackPrompt),
      builtWith: resolveI18nText(merged.builtWith, locale, 'Sites in XpertAI'),
      model: resolveI18nText(merged.model, locale, 'GPT-5.5'),
      techStack: resolveI18nText(merged.techStack, locale, 'Static HTML/CSS/JS'),
      useCase: resolveI18nText(merged.useCase, locale, 'Internal Tools'),
      type: resolveI18nText(merged.type, locale, 'App')
    })
  }

  function resolveI18nText(value, locale, fallback) {
    if (typeof value === 'string') return value
    if (isObject(value)) {
      return readString(value, locale || 'en_US') || readString(value, 'en_US') || fallback || ''
    }
    return fallback || ''
  }

  async function copyText(value) {
    const text = String(value || '')
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  function statusLabel(locale, value) {
    return labelFromMap(locale, 'status', value)
  }

  function storageLabel(locale, value) {
    return labelFromMap(locale, 'options', value)
  }

  function accessLabel(locale, value) {
    return labelFromMap(locale, 'options', value)
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
      window.__sitesAppSetContext && window.__sitesAppSetContext(nextContext)
      setTimeout(reportResize, 0)
      return
    }
    if (message.instanceId !== instanceId) return
    if (message.type === 'hostEvent') {
      window.__sitesAppHandleHostEvent && window.__sitesAppHandleHostEvent(message.event)
      return
    }
    if (message.requestId && pending.has(message.requestId)) {
      const item = pending.get(message.requestId)
      pending.delete(message.requestId)
      if (message.type === 'error') {
        item.reject(new Error(message.message || translate(normalizeLocale(), 'remoteRequestFailed')))
      } else {
        item.resolve(message)
      }
    }
  })

  function App() {
    const [context, setContext] = React.useState(null)
    const [query, setQuery] = React.useState({ page: 1, pageSize: 30, parameters: {} })
    const [data, setData] = React.useState({ items: [], meta: {} })
    const [loading, setLoading] = React.useState(false)
    const [busy, setBusy] = React.useState('')
    const [notice, setNotice] = React.useState(null)
    const [draft, setDraft] = React.useState(defaultDraft(normalizeLocale()))
    const [versionPrompt, setVersionPrompt] = React.useState('')
    const [envDraft, setEnvDraft] = React.useState({ key: '', value: '', secret: false })
    const [viewMode, setViewMode] = React.useState('list')
    const [templatesOpen, setTemplatesOpen] = React.useState(true)
    const [selectedTemplateKey, setSelectedTemplateKey] = React.useState('')
    const locale = normalizeLocale(context && context.locale)
    const t = React.useCallback((key, params) => translate(locale, key, params), [locale])

    window.__sitesAppSetContext = setContext
    window.__sitesAppHandleHostEvent = function () {
      void loadData(query)
    }

    React.useEffect(() => {
      if (!context) return
      const nextQuery = buildQuery(context)
      setQuery(nextQuery)
      void loadData(nextQuery)
    }, [context])

    React.useEffect(() => {
      reportResize()
    }, [data, loading, busy, notice, draft, versionPrompt, envDraft, viewMode, templatesOpen, selectedTemplateKey])

    React.useEffect(() => {
      if (!selectedTemplateKey) return
      function onKeyDown(event) {
        if (event.key === 'Escape') {
          setSelectedTemplateKey('')
        }
      }
      window.addEventListener('keydown', onKeyDown)
      return () => window.removeEventListener('keydown', onKeyDown)
    }, [selectedTemplateKey])

    async function loadData(nextQuery) {
      setLoading(true)
      try {
        const response = await request('requestData', { query: nextQuery || query })
        setData(response.data || { items: [], meta: {} })
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('loadFailed') })
      } finally {
        setLoading(false)
      }
    }

    async function runAction(actionKey, targetId, input, options) {
      setBusy(actionKey)
      setNotice(null)
      try {
        const parameters = Object.assign({}, query.parameters || {}, (options && options.parameters) || {})
        const response = await executeAction(actionKey, targetId, input, parameters)
        const result = response.result || {}
        const message = resolveText(result.message, t('actionDone'), locale)
        setNotice({ type: result.success === false ? 'error' : 'success', message })
        notify(result.success === false ? 'error' : 'success', message)
        if (result.success !== false && isDeploymentPreviewAction(actionKey)) {
          await publishDeploymentPreview(result)
        }
        let nextQuery = query
        const createdProjectId = result.data && ((result.data.project && result.data.project.id) || result.data.projectId)
        const projectId = createdProjectId || parameters.projectId
        if (projectId) {
          nextQuery = Object.assign({}, query, {
            parameters: Object.assign({}, query.parameters || {}, { projectId })
          })
          setQuery(nextQuery)
          setViewMode('detail')
        }
        if (result.refresh !== false) {
          await loadData(nextQuery)
        }
      } catch (error) {
        setNotice({ type: 'error', message: error.message || t('actionFailed') })
      } finally {
        setBusy('')
      }
    }

    function openProjectDetail(projectId) {
      const nextQuery = Object.assign({}, query, {
        parameters: Object.assign({}, query.parameters || {}, { projectId })
      })
      setViewMode('detail')
      setQuery(nextQuery)
      void loadData(nextQuery)
    }

    function goToList() {
      const parameters = Object.assign({}, query.parameters || {})
      delete parameters.projectId
      const nextQuery = Object.assign({}, query, { parameters })
      setViewMode('list')
      setQuery(nextQuery)
      void loadData(nextQuery)
    }

    async function copyTemplatePrompt(item) {
      try {
        await copyText(item && item.prompt)
        setNotice({ type: 'success', message: t('templates.copied') })
        notify('success', t('templates.copied'))
      } catch (error) {
        const message = error.message || t('actionFailed')
        setNotice({ type: 'error', message })
      }
    }

    async function tryTemplatePrompt(item) {
      if (!item || !item.prompt) return
      const busyKey = `try_template:${item.key}`
      setBusy(busyKey)
      setNotice(null)
      try {
        const payload = {
          text: item.prompt,
          clientMessageId: `${SITES_PLUGIN_NAME}:template:${item.key}:${Date.now()}`,
          state: {
            source: SITES_PLUGIN_NAME,
            templateKey: item.key,
            templateTitle: t(`templates.items.${item.key}.title`)
          }
        }
        const response = await invokeClientCommand(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, payload)
        const result = response.result || {}
        if (result.success === false) {
          throw new Error(result.message || t('templates.sendFailed'))
        }
        setNotice({ type: 'success', message: t('templates.sent') })
        notify('success', t('templates.sent'))
        setSelectedTemplateKey('')
      } catch (error) {
        const message = error.message || t('templates.sendFailed')
        setNotice({ type: 'error', message })
        notify('error', message)
      } finally {
        setBusy('')
      }
    }

    const items = data.items || []
    const deployedItems = items.filter(isDeployedProject)
    const meta = data.meta || {}
    const project = meta.project
    const versions = meta.versions || []
    const deployments = meta.deployments || []
    const environmentValues = meta.environmentValues || []
    const latestVersion = versions[0]
    const selectedTemplate = selectedTemplateKey ? getTemplatePromptItem(selectedTemplateKey, locale) : null
    function renderHeader() {
      return h('header', { className: 'topbar', key: 'topbar' }, [
        h('div', { className: 'topbar-title', key: 'title' }, [
          viewMode === 'detail' &&
            h(
              'button',
              { className: 'icon-button', onClick: goToList, title: t('back'), 'aria-label': t('back'), key: 'back' },
              icon('back')
            ),
          h('span', { className: 'app-menu-icon', key: 'menu-icon', 'aria-hidden': true }, icon('window')),
          h('div', { key: 'text' }, [
            h('p', { className: 'eyebrow', key: 'eyebrow' }, t('sites')),
            h('h1', { key: 'h1' }, viewMode === 'detail' && project ? project.name || t('title') : t('deployedSites'))
          ])
        ]),
        h('button', { className: 'icon-button', onClick: () => loadData(query), disabled: loading, title: t('refresh'), 'aria-label': t('refresh'), key: 'refresh' }, icon('refresh'))
      ])
    }

    function renderList() {
      return h('main', { className: 'sites-list-page', key: 'list' }, [
        h('div', { className: 'site-list-header', key: 'header' }, [
          h('span', { key: 'site' }, t('site')),
          h('span', { key: 'shared' }, t('sharedWith')),
          h('span', { className: 'visually-hidden', key: 'actions' }, t('settings'))
        ]),
        h(
          'div',
          { className: 'site-list', key: 'rows' },
          deployedItems.length
            ? deployedItems.map(renderSiteRow)
            : [h('div', { className: 'empty-list', key: 'empty' }, loading ? t('loading') : t('noDeployedSites'))]
        )
      ])
    }

    function renderTemplateDrawer() {
      const cards = SITE_TEMPLATE_KEYS.map((key, index) => ({
        key,
        index,
        title: t(`templates.items.${key}.title`),
        description: t(`templates.items.${key}.description`),
        previewSrc: TEMPLATE_PREVIEW_IMAGES[key]
      }))
      return h('section', { className: `template-drawer ${templatesOpen ? 'open' : 'collapsed'}`, key: 'templates' }, [
        h(
          'button',
          {
            type: 'button',
            className: 'template-drawer-handle',
            'aria-expanded': templatesOpen,
            onClick: () => setTemplatesOpen((value) => !value),
            key: 'handle'
          },
          [
            h('span', { className: 'drawer-grip', key: 'grip', 'aria-hidden': true }),
            h('span', { className: 'drawer-title', key: 'title' }, [
              h('strong', { key: 'strong' }, t('templates.title')),
              h('span', { key: 'subtitle' }, t('templates.subtitle'))
            ]),
            h('span', { className: 'drawer-count', key: 'count' }, String(cards.length)),
            icon(templatesOpen ? 'chevron-down' : 'chevron-up', 'chevron')
          ]
        ),
        h(
          'div',
          { className: 'template-drawer-body', key: 'body', 'aria-hidden': templatesOpen ? undefined : true },
          h(
            'div',
            { className: 'template-grid', key: 'grid' },
            cards.map((item) => renderTemplateCard(item))
          )
        )
      ])
    }

    function renderTemplateCard(item) {
      return h('article', {
        className: 'template-card',
        key: item.key,
        role: 'button',
        tabIndex: 0,
        onClick: () => setSelectedTemplateKey(item.key),
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setSelectedTemplateKey(item.key)
          }
        }
      }, [
        item.previewSrc ? renderTemplateImage(item) : renderTemplatePlaceholder(item.index),
        h('h3', { key: 'title' }, item.title),
        h('p', { key: 'description' }, item.description)
      ])
    }

    function renderTemplateDialog(item) {
      if (!item) return null
      const title = t(`templates.items.${item.key}.title`)
      const tryBusy = busy === `try_template:${item.key}`
      const facts = [
        [t('templates.model'), item.model],
        [t('templates.techStack'), item.techStack],
        [t('templates.useCase'), item.useCase],
        [t('templates.type'), item.type]
      ]
      return h(
        'div',
        {
          className: 'template-dialog-overlay',
          role: 'presentation',
          onClick: () => setSelectedTemplateKey(''),
          key: 'template-dialog'
        },
        h(
          'section',
          {
            className: 'template-dialog',
            role: 'dialog',
            'aria-modal': true,
            'aria-label': title,
            onClick: (event) => event.stopPropagation()
          },
          [
            h('div', { className: 'template-dialog-main', key: 'main' }, [
              h('div', { className: 'template-dialog-heading', key: 'heading' }, [
                h('h2', { key: 'title' }, t('templates.prompt')),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'icon-button',
                    onClick: () => setSelectedTemplateKey(''),
                    title: t('templates.close'),
                    'aria-label': t('templates.close'),
                    key: 'close'
                  },
                  icon('close')
                )
              ]),
              h('div', { className: 'prompt-box', key: 'prompt' }, [
                h('pre', { key: 'text' }, item.prompt),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'prompt-copy-button icon-button',
                    onClick: () => copyTemplatePrompt(item),
                    title: t('templates.copyPrompt'),
                    'aria-label': t('templates.copyPrompt'),
                    key: 'copy'
                  },
                  icon('copy')
                )
              ]),
              h(
                'button',
                {
                  type: 'button',
                  className: 'template-try-action primary-action',
                  onClick: () => tryTemplatePrompt(item),
                  disabled: tryBusy,
                  key: 'try'
                },
                buttonContent('external', tryBusy ? t('templates.trying') : t('templates.try'))
              )
            ]),
            h('aside', { className: 'template-dialog-meta', key: 'meta' }, [
              h('div', { className: 'meta-section', key: 'built' }, [
                h('span', { key: 'label' }, t('templates.builtWith')),
                h('strong', { key: 'value' }, item.builtWith)
              ]),
              facts.map(([label, value]) =>
                h('div', { className: 'meta-section', key: label }, [
                  h('span', { key: 'label' }, label),
                  h('strong', { key: 'value' }, value || '-')
                ])
              )
            ])
          ]
        )
      )
    }

    function renderTemplateImage(item) {
      return h(
        'div',
        { className: 'template-preview has-image', key: 'preview', 'aria-hidden': true },
        h('img', { src: item.previewSrc, alt: '', loading: 'lazy' })
      )
    }

    function renderTemplatePlaceholder(index) {
      return h('div', { className: `template-preview placeholder-${index % 3}`, key: 'preview', 'aria-hidden': true }, [
        h('span', { className: 'placeholder-top', key: 'top' }),
        h('span', { className: 'placeholder-side', key: 'side' }),
        h('span', { className: 'placeholder-hero', key: 'hero' }),
        h('span', { className: 'placeholder-card card-a', key: 'card-a' }),
        h('span', { className: 'placeholder-card card-b', key: 'card-b' }),
        h('span', { className: 'placeholder-card card-c', key: 'card-c' }),
        h('span', { className: 'placeholder-line line-a', key: 'line-a' }),
        h('span', { className: 'placeholder-line line-b', key: 'line-b' })
      ])
    }

    function renderSiteRow(item) {
      const title = item.name || item.slug || t('sites')
      const url = item.currentDeploymentUrl || item.slug || ''
      const detailsLabel = t('detailsLabel', { title })
      return h('article', { className: 'site-list-row', key: item.id || item.slug }, [
        h(
          'button',
          {
            className: 'site-thumbnail-button',
            onClick: () => openProjectDetail(item.id),
            title: detailsLabel,
            'aria-label': detailsLabel,
            key: 'thumbnail'
          },
          siteThumbnail(item)
        ),
        h('div', { className: 'site-list-main', key: 'main' }, [
          h(
            'button',
            {
              className: 'site-title-button',
              onClick: () => openProjectDetail(item.id),
              title: detailsLabel,
              key: 'title'
            },
            title
          ),
          h('div', { className: 'site-list-meta', key: 'meta' }, [
            h('span', { key: 'time' }, formatRelativeTime(item.updatedAt || item.createdAt, locale)),
            h('span', { key: 'dot' }, ' · '),
            h('span', { className: 'site-url', key: 'url' }, formatDisplayUrl(url))
          ])
        ]),
        h('div', { className: 'shared-cell', key: 'shared' }, [
          icon(item.audience === 'custom' ? 'users' : 'building'),
          h('span', { key: 'label' }, shareScopeLabel(locale, item))
        ]),
        h('div', { className: 'site-row-actions', key: 'actions' }, [
          item.currentDeploymentUrl &&
            h(
              'button',
              {
                className: 'preview-action list-preview-action',
                type: 'button',
                key: 'preview',
                onClick: () =>
                  openDeploymentPreview(item.currentDeploymentUrl, {
                    displayUrl: item.currentDeploymentUrl,
                    projectId: item.id,
                    deploymentId: item.currentDeploymentId,
                    slug: item.slug,
                    status: item.status,
                    accessMode: item.audience
                  })
              },
              buttonContent('external', t('buttons.preview'))
            ),
          h(
            'button',
            {
              className: 'icon-button settings-button',
              onClick: () => openProjectDetail(item.id),
              title: detailsLabel,
              'aria-label': detailsLabel,
              key: 'settings'
            },
            icon('settings')
          )
        ])
      ])
    }

    function renderDetail() {
      if (!project) {
        return h('main', { className: 'content', key: 'detail-loading' }, [
          h('div', { className: 'blank', key: 'blank' }, loading ? t('loading') : t('blank'))
        ])
      }

      return h('main', { className: 'content', key: 'detail' }, [
        h('section', { className: 'detail-grid', key: 'detail-grid' }, [
          h('div', { className: 'project-detail', key: 'project-detail' }, [
            h('div', { className: 'section-heading', key: 'project-title' }, [
              h('span', { key: 'label' }, project.slug),
              h('span', { className: `status ${project.status}`, key: 'status' }, statusLabel(locale, project.status))
            ]),
            h('h2', { key: 'name' }, project.name),
            h('p', { className: 'muted', key: 'desc' }, project.description || t('noDescription')),
            h('dl', { className: 'facts', key: 'facts' }, [
              fact(t('labels.access'), accessLabel(locale, project.audience)),
              fact(t('labels.storage'), storageLabel(locale, project.storageShape)),
              fact(t('labels.sourcePath'), project.sourcePath || t('none')),
              fact(t('labels.d1'), project.hostingConfig && project.hostingConfig.d1 ? project.hostingConfig.d1 : t('none')),
              fact(t('labels.r2'), project.hostingConfig && project.hostingConfig.r2 ? project.hostingConfig.r2 : t('none'))
            ]),
            project.currentDeploymentUrl &&
              h('div', { className: 'deployment-preview-row', key: 'url' }, [
                h(
                  'a',
                  { className: 'deployment-link', href: project.currentDeploymentUrl, target: '_blank', rel: 'noreferrer', key: 'link' },
                  project.currentDeploymentUrl
                ),
                h(
                  'button',
                  {
                    className: 'preview-action',
                    type: 'button',
                    key: 'preview',
                    onClick: () =>
                      openDeploymentPreview(project.currentDeploymentUrl, {
                        displayUrl: project.currentDeploymentUrl,
                        projectId: project.id,
                        deploymentId: project.currentDeploymentId,
                        slug: project.slug,
                        status: project.status,
                        accessMode: project.audience
                      })
                  },
                  buttonContent('external', t('buttons.preview'))
                )
              ])
          ]),
          h('div', { className: 'operations', key: 'operations' }, [
            h('div', { className: 'section-heading', key: 'save-heading' }, [
              h('span', { key: 'label' }, t('labels.version')),
              latestVersion && h('strong', { key: 'number' }, `#${latestVersion.versionNumber}`)
            ]),
            h('textarea', {
              value: versionPrompt,
              onChange: (event) => setVersionPrompt(event.target.value),
              placeholder: t('placeholders.versionPrompt'),
              rows: 3,
              key: 'versionPrompt'
            }),
            h('div', { className: 'button-row', key: 'version-actions' }, [
              h(
                'button',
                {
                  disabled: !!busy,
                  onClick: () =>
                    runAction('save_version', project.id, {
                      projectId: project.id,
                      prompt: versionPrompt || draft.prompt,
                      title: versionPrompt ? t('defaults.updatedVersionTitle') : t('defaults.versionTitle')
                    })
                },
                buttonContent('save', busy === 'save_version' ? t('buttons.saving') : t('buttons.saveVersion'))
              ),
              h(
                'button',
                {
                  disabled: !!busy || !latestVersion,
                  onClick: () =>
                    runAction('deploy_version', project.id, {
                      projectId: project.id,
                      versionId: latestVersion && latestVersion.id,
                      accessMode: project.audience
                    })
                },
                buttonContent('rocket', busy === 'deploy_version' ? t('buttons.deploying') : t('buttons.deployLatest'))
              )
            ]),
            h('div', { className: 'section-heading small', key: 'env-heading' }, [h('span', { key: 'label' }, t('labels.environment'))]),
            h('div', { className: 'env-grid', key: 'env-grid' }, [
              h('input', { placeholder: t('placeholders.envKey'), value: envDraft.key, onChange: (event) => setEnvDraft(Object.assign({}, envDraft, { key: event.target.value })), key: 'key' }),
              h('input', { placeholder: t('placeholders.envValue'), value: envDraft.value, onChange: (event) => setEnvDraft(Object.assign({}, envDraft, { value: event.target.value })), key: 'value' }),
              h('label', { className: 'check', key: 'secret' }, [
                h('input', { type: 'checkbox', checked: envDraft.secret, onChange: (event) => setEnvDraft(Object.assign({}, envDraft, { secret: event.target.checked })) }),
                h('span', null, t('labels.secret'))
              ]),
              h(
                'button',
                {
                  disabled: !!busy || !envDraft.key,
                  onClick: () => runAction('upsert_env', project.id, Object.assign({ projectId: project.id }, envDraft))
                },
                buttonContent('key', t('buttons.save'))
              )
            ])
          ]),
          tableSection(t('labels.versions'), ['#', t('labels.status'), t('labels.commit'), t('labels.digest')], versions, (item) => [
            `#${item.versionNumber}`,
            statusLabel(locale, item.status),
            item.sourceCommit || '-',
            item.artifactDigest ? item.artifactDigest.slice(0, 12) : '-'
          ], t),
          tableSection(t('labels.deployments'), [t('labels.status'), t('labels.access'), t('labels.url')], deployments, (item) => [
            statusLabel(locale, item.status),
            accessLabel(locale, item.accessMode),
            item.deploymentUrl ? h('a', { href: item.deploymentUrl, target: '_blank', rel: 'noreferrer' }, item.deploymentUrl) : '-'
          ], t),
          tableSection(t('labels.environment'), [t('labels.key'), t('labels.value'), t('labels.secret')], environmentValues, (item) => [
            item.key,
            item.value || '',
            item.secret ? t('yes') : t('no')
          ], t)
        ])
      ])
    }

    return h('div', { className: 'sites-app' }, [
      renderHeader(),
      notice && h('div', { className: `notice ${notice.type}`, key: 'notice' }, notice.message),
      viewMode === 'detail' ? renderDetail() : renderList(),
      viewMode === 'list' && renderTemplateDrawer(),
      viewMode === 'list' && selectedTemplate && renderTemplateDialog(selectedTemplate)
    ])
  }

  function field(label, control, className) {
    return h('label', { className: `field ${className || ''}`, key: label }, [
      h('span', { key: 'label' }, label),
      control
    ])
  }

  function fact(label, value) {
    return [h('dt', { key: `${label}-dt` }, label), h('dd', { key: `${label}-dd` }, value || '-')]
  }

  function tableSection(title, columns, rows, rowBuilder, t) {
    return h('section', { className: 'table-section', key: title }, [
      h('div', { className: 'section-heading', key: 'heading' }, [
        h('span', { key: 'label' }, title),
        h('strong', { key: 'count' }, String(rows.length))
      ]),
      rows.length
        ? h('table', { key: 'table' }, [
            h('thead', { key: 'head' }, h('tr', null, columns.map((column) => h('th', { key: column }, column)))),
            h(
              'tbody',
              { key: 'body' },
              rows.map((item) =>
                h(
                  'tr',
                  { key: item.id || JSON.stringify(item) },
                  rowBuilder(item).map((cell, index) => h('td', { key: index }, cell))
                )
              )
            )
          ])
        : h('div', { className: 'empty', key: 'empty' }, t('noRecords'))
    ])
  }

  function isDeployedProject(project) {
    return Boolean(project && (project.currentDeploymentUrl || project.status === 'deployed' || Number(project.deploymentCount || 0) > 0))
  }

  function formatDisplayUrl(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    return raw.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  }

  function formatRelativeTime(value, locale) {
    const date = new Date(value || '')
    const timestamp = date.getTime()
    if (!Number.isFinite(timestamp)) return ''
    const elapsed = Math.max(0, Date.now() - timestamp)
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const month = 30 * day
    if (elapsed < minute) return translate(locale, 'time.now')
    if (elapsed < hour) return translate(locale, 'time.minutes', { count: Math.floor(elapsed / minute) })
    if (elapsed < day) return translate(locale, 'time.hours', { count: Math.floor(elapsed / hour) })
    if (elapsed < month) return translate(locale, 'time.days', { count: Math.floor(elapsed / day) })
    return translate(locale, 'time.months', { count: Math.floor(elapsed / month) })
  }

  function shareScopeLabel(locale, project) {
    if (project && project.audience === 'custom') {
      const count = Array.isArray(project.customAudience) ? project.customAudience.length : 0
      if (count) {
        return translate(locale, count === 1 ? 'groupCount' : 'groupCountPlural', { count })
      }
      return translate(locale, 'peopleAndGroups')
    }
    if (project && project.audience === 'workspace_all') {
      return translate(locale, 'yourWorkspace')
    }
    if (project && project.audience === 'admins_only') {
      return translate(locale, 'ownersAndAdmins')
    }
    return accessLabel(locale, project && project.audience)
  }

  function siteThumbnail(project) {
    const variant = Math.abs(hashString(`${project && project.slug ? project.slug : ''}${project && project.name ? project.name : ''}`)) % 4
    return h('span', { className: `site-thumbnail thumb-${variant}` }, [
      h('span', { className: 'thumb-rail', key: 'rail' }, [
        h('span', { key: 'rail-1' }),
        h('span', { key: 'rail-2' }),
        h('span', { key: 'rail-3' })
      ]),
      h('span', { className: 'thumb-body', key: 'body' }, [
        h('span', { className: 'thumb-top', key: 'top' }, [
          h('span', { key: 'top-1' }),
          h('span', { key: 'top-2' }),
          h('span', { key: 'top-3' })
        ]),
        h('span', { className: 'thumb-grid', key: 'grid' }, [
          h('span', { key: 'card-1' }),
          h('span', { key: 'card-2' }),
          h('span', { key: 'card-3' }),
          h('span', { key: 'card-4' })
        ])
      ])
    ])
  }

  function hashString(value) {
    return String(value || '').split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0)
  }

  function buttonContent(iconName, label) {
    return [icon(iconName, 'icon'), h('span', { key: 'text' }, label)]
  }

  function icon(name, key) {
    const paths = {
      back: 'M7.82843 10.9999H20V12.9999H7.82843L13.1924 18.3638L11.7782 19.778L4 11.9999L11.7782 4.22168L13.1924 5.63589L7.82843 10.9999Z',
      building:
        'M21 20H23V22H1V20H3V3C3 2.44772 3.44772 2 4 2H20C20.5523 2 21 2.44772 21 3V20ZM19 20V4H5V20H19ZM8 11H11V13H8V11ZM8 7H11V9H8V7ZM8 15H11V17H8V15ZM13 15H16V17H13V15ZM13 11H16V13H13V11ZM13 7H16V9H13V7Z',
      'chevron-down': 'M12 13.1716L17.6569 7.51472L19.0711 8.92893L12 16L4.92893 8.92893L6.34315 7.51472L12 13.1716Z',
      'chevron-up': 'M12 10.8284L6.34315 16.4853L4.92893 15.0711L12 8L19.0711 15.0711L17.6569 16.4853L12 10.8284Z',
      close:
        'M11.9997 10.5865L16.9495 5.63672L18.3637 7.05093L13.4139 12.0007L18.3637 16.9504L16.9495 18.3646L11.9997 13.4149L7.04996 18.3646L5.63574 16.9504L10.5855 12.0007L5.63574 7.05093L7.04996 5.63672L11.9997 10.5865Z',
      copy:
        'M7 7V3C7 2.44772 7.44772 2 8 2H20C20.5523 2 21 2.44772 21 3V17C21 17.5523 20.5523 18 20 18H16V21C16 21.5523 15.5523 22 15 22H4C3.44772 22 3 21.5523 3 21V8C3 7.44772 3.44772 7 4 7H7ZM9 7H15C15.5523 7 16 7.44772 16 8V16H19V4H9V7ZM5 9V20H14V9H5Z',
      external:
        'M10 6V8H5V19H16V14H18V20C18 20.5523 17.5523 21 17 21H4C3.44772 21 3 20.5523 3 20V7C3 6.44772 3.44772 6 4 6H10ZM21 3V11H19L18.9999 6.413L11.2071 14.2071L9.79289 12.7929L17.5849 5H13V3H21Z',
      key: 'M10.7577 11.8281L18.6066 3.97919L20.0208 5.3934L18.6066 6.80761L21.0815 9.28249L19.6673 10.6967L17.1924 8.22183L15.7782 9.63604L17.8995 11.7574L16.4853 13.1716L14.364 11.0503L12.1719 13.2423C13.4581 15.1837 13.246 17.8251 11.5355 19.5355C9.58291 21.4882 6.41709 21.4882 4.46447 19.5355C2.51184 17.5829 2.51184 14.4171 4.46447 12.4645C6.17493 10.754 8.81633 10.5419 10.7577 11.8281ZM10.1213 18.1213C11.2929 16.9497 11.2929 15.0503 10.1213 13.8787C8.94975 12.7071 7.05025 12.7071 5.87868 13.8787C4.70711 15.0503 4.70711 16.9497 5.87868 18.1213C7.05025 19.2929 8.94975 19.2929 10.1213 18.1213Z',
      refresh:
        'M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z',
      rocket:
        'M4.99958 12.9999C4.99958 7.91198 7.90222 3.5636 11.9996 1.81799C16.0969 3.5636 18.9996 7.91198 18.9996 12.9999C18.9996 13.8229 18.9236 14.6264 18.779 15.4027L20.7194 17.2353C20.8845 17.3913 20.9238 17.6389 20.815 17.8383L18.3196 22.4133C18.1873 22.6557 17.8836 22.7451 17.6412 22.6128C17.5993 22.59 17.5608 22.5612 17.5271 22.5274L15.2925 20.2928C15.1049 20.1053 14.8506 19.9999 14.5854 19.9999H9.41379C9.14857 19.9999 8.89422 20.1053 8.70668 20.2928L6.47209 22.5274C6.27683 22.7227 5.96025 22.7227 5.76498 22.5274C5.73122 22.4937 5.70246 22.4552 5.67959 22.4133L3.18412 17.8383C3.07537 17.6389 3.11464 17.3913 3.27975 17.2353L5.22014 15.4027C5.07551 14.6264 4.99958 13.8229 4.99958 12.9999ZM6.47542 19.6957L7.29247 18.8786C7.85508 18.316 8.61814 17.9999 9.41379 17.9999H14.5854C15.381 17.9999 16.1441 18.316 16.7067 18.8786L17.5237 19.6957L18.5056 17.8955L17.4058 16.8568C16.9117 16.3901 16.6884 15.7045 16.8128 15.0364C16.9366 14.3722 16.9996 13.6911 16.9996 12.9999C16.9996 9.13037 15.0045 5.69965 11.9996 4.04033C8.99462 5.69965 6.99958 9.13037 6.99958 12.9999C6.99958 13.6911 7.06255 14.3722 7.18631 15.0364C7.31078 15.7045 7.08746 16.3901 6.59338 16.8568L5.49353 17.8955L6.47542 19.6957ZM11.9996 12.9999C10.895 12.9999 9.99958 12.1045 9.99958 10.9999C9.99958 9.89537 10.895 8.99994 11.9996 8.99994C13.1041 8.99994 13.9996 9.89537 13.9996 10.9999C13.9996 12.1045 13.1041 12.9999 11.9996 12.9999Z',
      save:
        'M18 19H19V6.82843L17.1716 5H16V9H7V5H5V19H6V12H18V19ZM4 3H18L20.7071 5.70711C20.8946 5.89464 21 6.149 21 6.41421V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM8 14V19H16V14H8Z',
      settings:
        'M3.33946 17.0002C2.90721 16.2515 2.58277 15.4702 2.36133 14.6741C3.3338 14.1779 3.99972 13.1668 3.99972 12.0002C3.99972 10.8345 3.3348 9.824 2.36353 9.32741C2.81025 7.71651 3.65857 6.21627 4.86474 4.99001C5.7807 5.58416 6.98935 5.65534 7.99972 5.072C9.01009 4.48866 9.55277 3.40635 9.4962 2.31604C11.1613 1.8846 12.8847 1.90004 14.5031 2.31862C14.4475 3.40806 14.9901 4.48912 15.9997 5.072C17.0101 5.65532 18.2187 5.58416 19.1346 4.99007C19.7133 5.57986 20.2277 6.25151 20.66 7.00021C21.0922 7.7489 21.4167 8.53025 21.6381 9.32628C20.6656 9.82247 19.9997 10.8336 19.9997 12.0002C19.9997 13.166 20.6646 14.1764 21.6359 14.673C21.1892 16.2839 20.3409 17.7841 19.1347 19.0104C18.2187 18.4163 17.0101 18.3451 15.9997 18.9284C14.9893 19.5117 14.4467 20.5941 14.5032 21.6844C12.8382 22.1158 11.1148 22.1004 9.49633 21.6818C9.55191 20.5923 9.00929 19.5113 7.99972 18.9284C6.98938 18.3451 5.78079 18.4162 4.86484 19.0103C4.28617 18.4205 3.77172 17.7489 3.33946 17.0002ZM8.99972 17.1964C10.0911 17.8265 10.8749 18.8227 11.2503 19.9659C11.7486 20.0133 12.2502 20.014 12.7486 19.9675C13.1238 18.8237 13.9078 17.8268 14.9997 17.1964C16.0916 16.5659 17.347 16.3855 18.5252 16.6324C18.8146 16.224 19.0648 15.7892 19.2729 15.334C18.4706 14.4373 17.9997 13.2604 17.9997 12.0002C17.9997 10.74 18.4706 9.5632 19.2729 8.6665C19.1688 8.4405 19.0538 8.21822 18.9279 8.00021C18.802 7.78219 18.667 7.57148 18.5233 7.36842C17.3457 7.61476 16.0911 7.43414 14.9997 6.80405C13.9083 6.17395 13.1246 5.17768 12.7491 4.03455C12.2509 3.98714 11.7492 3.98646 11.2509 4.03292C10.8756 5.17671 10.0916 6.17364 8.99972 6.80405C7.9078 7.43447 6.65245 7.61494 5.47428 7.36803C5.18485 7.77641 4.93463 8.21117 4.72656 8.66637C5.52881 9.56311 5.99972 10.74 5.99972 12.0002C5.99972 13.2604 5.52883 14.4372 4.72656 15.3339C4.83067 15.5599 4.94564 15.7822 5.07152 16.0002C5.19739 16.2182 5.3324 16.4289 5.47612 16.632C6.65377 16.3857 7.90838 16.5663 8.99972 17.1964ZM11.9997 15.0002C10.3429 15.0002 8.99972 13.6571 8.99972 12.0002C8.99972 10.3434 10.3429 9.00021 11.9997 9.00021C13.6566 9.00021 14.9997 10.3434 14.9997 12.0002C14.9997 13.6571 13.6566 15.0002 11.9997 15.0002ZM11.9997 13.0002C12.552 13.0002 12.9997 12.5525 12.9997 12.0002C12.9997 11.4479 12.552 11.0002 11.9997 11.0002C11.4474 11.0002 10.9997 11.4479 10.9997 12.0002C10.9997 12.5525 11.4474 13.0002 11.9997 13.0002Z',
      users:
        'M12 11C14.7614 11 17 13.2386 17 16V22H15V16C15 14.4023 13.7511 13.0963 12.1763 13.0051L12 13C10.4023 13 9.09634 14.2489 9.00509 15.8237L9 16V22H7V16C7 13.2386 9.23858 11 12 11ZM5.5 14C5.77885 14 6.05009 14.0326 6.3101 14.0942C6.14202 14.594 6.03873 15.122 6.00896 15.6693L6 16L6.0007 16.0856C5.88757 16.0456 5.76821 16.0187 5.64446 16.0069L5.5 16C4.7203 16 4.07955 16.5949 4.00687 17.3555L4 17.5V22H2V17.5C2 15.567 3.567 14 5.5 14ZM18.5 14C20.433 14 22 15.567 22 17.5V22H20V17.5C20 16.7203 19.4051 16.0796 18.6445 16.0069L18.5 16C18.3248 16 18.1566 16.03 18.0003 16.0852L18 16C18 15.3343 17.8916 14.694 17.6915 14.0956C17.9499 14.0326 18.2211 14 18.5 14ZM5.5 8C6.88071 8 8 9.11929 8 10.5C8 11.8807 6.88071 13 5.5 13C4.11929 13 3 11.8807 3 10.5C3 9.11929 4.11929 8 5.5 8ZM18.5 8C19.8807 8 21 9.11929 21 10.5C21 11.8807 19.8807 13 18.5 13C17.1193 13 16 11.8807 16 10.5C16 9.11929 17.1193 8 18.5 8ZM5.5 10C5.22386 10 5 10.2239 5 10.5C5 10.7761 5.22386 11 5.5 11C5.77614 11 6 10.7761 6 10.5C6 10.2239 5.77614 10 5.5 10ZM18.5 10C18.2239 10 18 10.2239 18 10.5C18 10.7761 18.2239 11 18.5 11C18.7761 11 19 10.7761 19 10.5C19 10.2239 18.7761 10 18.5 10ZM12 2C14.2091 2 16 3.79086 16 6C16 8.20914 14.2091 10 12 10C9.79086 10 8 8.20914 8 6C8 3.79086 9.79086 2 12 2ZM12 4C10.8954 4 10 4.89543 10 6C10 7.10457 10.8954 8 12 8C13.1046 8 14 7.10457 14 6C14 4.89543 13.1046 4 12 4Z',
      window:
        'M21 3C21.5523 3 22 3.44772 22 4V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V4C2 3.44772 2.44772 3 3 3H21ZM20 11H4V19H20V11ZM20 5H4V9H20V5ZM11 6V8H9V6H11ZM7 6V8H5V6H7Z'
    }
    const path = paths[name]
    return h(
      'svg',
      {
        key: key || name,
        className: 'svg-icon',
        viewBox: '0 0 24 24',
        fill: 'currentColor',
        'aria-hidden': true
      },
      path ? h('path', { d: path }) : null
    )
  }

  function injectStyles() {
    const style = document.createElement('style')
    style.textContent = `
      :root {
        color-scheme: inherit;
        --sites-surface: var(--xui-color-card, Canvas);
        --sites-surface-foreground: var(--xui-color-card-foreground, var(--xui-color-foreground, CanvasText));
        --sites-muted-bg: var(--xui-color-muted, transparent);
        --sites-border: var(--xui-color-border, GrayText);
        --sites-input: var(--xui-color-input, var(--sites-border));
        --sites-text: var(--xui-color-foreground, CanvasText);
        --sites-muted: var(--xui-color-muted-foreground, GrayText);
        --sites-primary: var(--xui-color-primary, Highlight);
        --sites-primary-foreground: var(--xui-color-primary-foreground, HighlightText);
        --sites-danger: var(--xui-color-destructive, var(--sites-text));
        --sites-success: var(--xui-color-success, var(--sites-text));
        --sites-warning: var(--xui-color-warning, var(--sites-primary));
        --sites-radius-sm: var(--xui-radius-sm, 6px);
        --sites-radius-md: var(--xui-radius-md, 8px);
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; color: var(--sites-text); font-family: var(--xui-font-family, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif); }
      .sites-app { min-height: 100vh; display: flex; flex-direction: column; }
      .topbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--sites-border); background: transparent; }
      .topbar-title { min-width: 0; display: flex; align-items: center; gap: 8px; }
      .app-menu-icon { width: 30px; height: 30px; border: 1px solid var(--sites-border); border-radius: var(--sites-radius-sm); display: inline-flex; align-items: center; justify-content: center; color: var(--sites-primary); background: color-mix(in srgb, var(--sites-primary) 8%, transparent); flex: 0 0 auto; }
      .eyebrow { margin: 0 0 2px; font-size: var(--xui-font-size-xs, 12px); font-weight: 800; color: var(--sites-primary); text-transform: uppercase; letter-spacing: 0; }
      h1, h2 { margin: 0; letter-spacing: 0; }
      h1 { font-size: 19px; line-height: 1.2; }
      h2 { font-size: 18px; line-height: 1.25; }
      .content { flex: 1 1 auto; min-height: 0; padding: 12px; display: grid; gap: 12px; align-content: start; }
      .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: var(--xui-font-size-xs, 12px); font-weight: 800; color: var(--sites-muted); text-transform: uppercase; letter-spacing: 0; }
      .section-heading.small { margin-top: 12px; }
      .muted, .empty, .blank, .empty-list { color: var(--sites-muted); }
      .status { justify-self: start; border-radius: 999px; padding: 2px 7px; font-size: var(--xui-font-size-xs, 12px); font-weight: 800; border: 1px solid var(--sites-border); background: transparent; color: var(--sites-muted); }
      .status.deployed { color: var(--sites-success); border-color: color-mix(in srgb, var(--sites-success) 35%, var(--sites-border)); }
      .status.version_saved { color: var(--sites-warning); border-color: color-mix(in srgb, var(--sites-warning) 35%, var(--sites-border)); }
      .status.archived { color: var(--sites-muted); }
      .create-band, .project-detail, .operations, .table-section, .blank { border: 1px solid var(--sites-border); border-radius: var(--sites-radius-md); background: transparent; color: var(--sites-text); padding: 12px; }
      .sites-list-page { flex: 1 1 auto; min-height: 0; padding: 14px 18px 16px; }
      .site-list-header { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 260px) minmax(140px, auto); gap: 18px; padding: 0 0 8px; border-bottom: 1px solid var(--sites-border); color: var(--sites-muted); font-size: var(--xui-font-size-xs, 12px); font-weight: 600; }
      .site-list { display: grid; }
      .site-list-row { display: grid; grid-template-columns: 124px minmax(0, 1fr) minmax(180px, 260px) minmax(140px, auto); gap: 18px; align-items: center; min-height: 98px; padding: 12px 0; border-bottom: 1px solid color-mix(in srgb, var(--sites-border) 80%, transparent); }
      .site-thumbnail-button, .site-title-button { min-height: auto; border: 0; background: transparent; color: var(--sites-text); padding: 0; }
      .site-thumbnail-button { width: 124px; height: 74px; border-radius: var(--sites-radius-md); overflow: hidden; }
      .site-thumbnail-button:focus-visible, .site-title-button:focus-visible, .icon-button:focus-visible, .preview-action:focus-visible { outline: 2px solid var(--sites-primary); outline-offset: 2px; }
      .site-thumbnail { position: relative; width: 124px; height: 74px; display: grid; grid-template-columns: 20px 1fr; overflow: hidden; border: 1px solid var(--sites-border); border-radius: var(--sites-radius-md); background: color-mix(in srgb, var(--sites-surface) 82%, transparent); }
      .thumb-rail { display: grid; align-content: start; gap: 6px; padding: 8px 5px; border-right: 1px solid color-mix(in srgb, var(--sites-border) 70%, transparent); }
      .thumb-rail span { width: 8px; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--sites-muted) 38%, transparent); }
      .thumb-body { display: grid; grid-template-rows: 18px 1fr; min-width: 0; }
      .thumb-top { display: grid; grid-template-columns: 1fr 18px 18px; gap: 5px; align-items: center; padding: 5px 7px; border-bottom: 1px solid color-mix(in srgb, var(--sites-border) 70%, transparent); }
      .thumb-top span { height: 6px; border-radius: 999px; background: color-mix(in srgb, var(--sites-muted) 34%, transparent); }
      .thumb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 7px; }
      .thumb-grid span { border-radius: 5px; border: 1px solid color-mix(in srgb, var(--sites-border) 70%, transparent); background: color-mix(in srgb, var(--sites-muted) 12%, transparent); }
      .thumb-0 .thumb-top span:first-child, .thumb-1 .thumb-grid span:nth-child(1), .thumb-2 .thumb-rail span:nth-child(2), .thumb-3 .thumb-grid span:nth-child(4) { background: color-mix(in srgb, var(--sites-primary) 58%, transparent); }
      .thumb-1 .thumb-top span:nth-child(2), .thumb-2 .thumb-grid span:nth-child(2), .thumb-3 .thumb-rail span:nth-child(1) { background: color-mix(in srgb, var(--sites-success) 48%, transparent); }
      .thumb-2 .thumb-top span:nth-child(3), .thumb-0 .thumb-grid span:nth-child(3), .thumb-3 .thumb-grid span:nth-child(1) { background: color-mix(in srgb, var(--sites-warning) 48%, transparent); }
      .site-list-main { min-width: 0; display: grid; gap: 4px; }
      .site-title-button { display: block; width: 100%; text-align: left; justify-content: flex-start; font-size: var(--xui-font-size-md, 16px); line-height: 1.2; font-weight: 750; overflow-wrap: anywhere; }
      .site-title-button:hover { color: var(--sites-primary); }
      .site-list-meta { min-width: 0; display: flex; align-items: center; gap: 0; color: var(--sites-muted); font-size: var(--xui-font-size-sm, 13px); line-height: 1.3; }
      .site-url { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .shared-cell { min-width: 0; display: flex; align-items: center; gap: 7px; font-size: var(--xui-font-size-sm, 13px); line-height: 1.25; color: var(--sites-text); }
      .site-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
      .list-preview-action { min-width: 88px; gap: 5px; font-size: var(--xui-font-size-button, 13px); }
      .settings-button { color: var(--sites-muted); }
      .empty-list { min-height: 150px; display: grid; place-items: center; border-bottom: 1px solid var(--sites-border); font-weight: 700; }
      .template-drawer { position: sticky; bottom: 0; z-index: 2; flex: 0 0 auto; margin: 0 18px; border: 1px solid var(--sites-border); border-bottom: 0; border-radius: 14px 14px 0 0; background: color-mix(in srgb, var(--sites-surface) 92%, transparent); overflow: hidden; }
      .template-drawer-handle { width: 100%; min-height: 42px; border: 0; border-radius: 0; display: grid; grid-template-columns: 28px minmax(0, 1fr) auto 24px; align-items: center; gap: 10px; padding: 6px 12px; background: transparent; color: var(--sites-text); text-align: left; }
      .template-drawer-handle:hover { color: var(--sites-primary); }
      .drawer-grip { width: 28px; height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--sites-muted) 42%, transparent); justify-self: center; }
      .drawer-title { min-width: 0; display: grid; gap: 1px; }
      .drawer-title strong { font-size: var(--xui-font-size-sm, 13px); line-height: 1.15; }
      .drawer-title span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sites-muted); font-size: var(--xui-font-size-xs, 12px); line-height: 1.2; font-weight: 600; }
      .drawer-count { min-width: 24px; height: 22px; border: 1px solid var(--sites-border); border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; color: var(--sites-muted); font-size: var(--xui-font-size-xs, 12px); font-weight: 800; }
      .template-drawer-body { max-height: 490px; overflow: hidden; padding: 10px 12px 14px; border-top: 1px solid color-mix(in srgb, var(--sites-border) 70%, transparent); transition: max-height 180ms ease, padding 180ms ease, border-color 180ms ease; }
      .template-drawer.collapsed .template-drawer-body { max-height: 0; padding-top: 0; padding-bottom: 0; border-top-color: transparent; }
      .template-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 14px; }
      .template-card { min-width: 0; border-radius: var(--sites-radius-md); cursor: pointer; outline: none; }
      .template-card:hover h3, .template-card:focus-visible h3 { color: var(--sites-primary); }
      .template-card:focus-visible { box-shadow: 0 0 0 2px color-mix(in srgb, var(--sites-primary) 70%, transparent); }
      .template-card h3 { margin: 8px 0 4px; font-size: var(--xui-font-size-md, 15px); line-height: 1.18; letter-spacing: 0; }
      .template-card p { margin: 0; color: var(--sites-muted); font-size: var(--xui-font-size-sm, 13px); line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .template-preview { position: relative; height: 116px; border: 1px solid var(--sites-border); border-radius: var(--sites-radius-md); overflow: hidden; background: color-mix(in srgb, var(--sites-surface) 86%, transparent); }
      .template-preview.has-image { background: color-mix(in srgb, var(--sites-surface) 92%, transparent); }
      .template-preview img { width: 100%; height: 100%; display: block; object-fit: cover; }
      .template-preview span { position: absolute; display: block; border-radius: 5px; background: color-mix(in srgb, var(--sites-muted) 16%, transparent); }
      .placeholder-top { left: 10px; right: 10px; top: 8px; height: 10px; border-radius: 999px; }
      .placeholder-side { left: 10px; top: 26px; bottom: 10px; width: 26px; }
      .placeholder-hero { left: 44px; right: 10px; top: 26px; height: 26px; }
      .placeholder-card { top: 59px; height: 22px; }
      .placeholder-card.card-a { left: 44px; width: 27%; }
      .placeholder-card.card-b { left: calc(44px + 30%); width: 24%; }
      .placeholder-card.card-c { right: 10px; width: 19%; }
      .placeholder-line { height: 4px; border-radius: 999px; background: color-mix(in srgb, var(--sites-primary) 24%, transparent); }
      .placeholder-line.line-a { left: 14px; top: 34px; width: 16px; }
      .placeholder-line.line-b { left: 14px; top: 47px; width: 16px; }
      .placeholder-1 .placeholder-hero, .placeholder-1 .placeholder-line { background: color-mix(in srgb, var(--sites-success) 28%, transparent); }
      .placeholder-2 .placeholder-hero, .placeholder-2 .placeholder-line { background: color-mix(in srgb, var(--sites-warning) 28%, transparent); }
      .template-dialog-overlay { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 24px; background: color-mix(in srgb, Canvas 64%, transparent); }
      .template-dialog { width: min(1120px, 100%); max-height: min(760px, calc(100dvh - 48px)); display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 320px); gap: 14px; color: var(--sites-text); }
      .template-dialog-main, .template-dialog-meta { min-width: 0; border: 1px solid var(--sites-border); border-radius: 18px; background: var(--sites-surface); color: var(--sites-surface-foreground); }
      .template-dialog-main { padding: 24px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 14px; }
      .template-dialog-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .template-dialog-heading h2 { font-size: 19px; }
      .prompt-box { position: relative; min-height: 240px; max-height: 430px; overflow: auto; border: 1px solid var(--sites-border); border-radius: var(--sites-radius-md); background: color-mix(in srgb, var(--sites-surface) 94%, var(--sites-muted) 6%); }
      .prompt-box pre { margin: 0; padding: 20px 48px 20px 20px; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--sites-surface-foreground); font: 500 14px/1.55 var(--xui-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace); letter-spacing: 0; }
      .prompt-copy-button { position: sticky; top: 10px; float: right; margin: 10px 10px 0 0; background: color-mix(in srgb, var(--sites-surface) 90%, transparent); color: var(--sites-muted); }
      .template-try-action { justify-self: start; min-width: 112px; gap: 6px; }
      .template-dialog-meta { padding: 24px; display: grid; align-content: start; gap: 0; }
      .meta-section { display: grid; gap: 12px; padding: 20px 0; border-bottom: 1px solid color-mix(in srgb, var(--sites-border) 70%, transparent); }
      .meta-section:first-child { padding-top: 0; }
      .meta-section span { color: var(--sites-muted); font-size: var(--xui-font-size-sm, 14px); line-height: 1.3; }
      .meta-section strong { justify-self: start; border-radius: 999px; padding: 4px 10px; background: color-mix(in srgb, var(--sites-muted) 9%, transparent); font-size: var(--xui-font-size-sm, 14px); line-height: 1.2; font-weight: 650; }
      .meta-section:first-child strong { padding: 0; border-radius: 0; background: transparent; font-size: var(--xui-font-size-md, 16px); }
      .form-grid { display: grid; grid-template-columns: minmax(160px, 1fr) 140px 150px; gap: 8px; }
      .field { display: grid; gap: 4px; font-size: var(--xui-font-size-xs, 12px); font-weight: 800; color: var(--sites-muted); text-transform: uppercase; letter-spacing: 0; }
      .field.wide { margin-top: 8px; }
      input, textarea, select { width: 100%; border: 1px solid var(--sites-input); border-radius: var(--sites-radius-md); padding: 8px 10px; color: var(--sites-surface-foreground); background: var(--sites-surface); font: inherit; text-transform: none; }
      textarea { resize: vertical; line-height: 1.45; }
      button, .deployment-link { min-height: var(--xui-button-height, 32px); border-radius: var(--sites-radius-md); border: 1px solid var(--sites-input); padding: 0 10px; background: var(--sites-surface); color: var(--sites-surface-foreground); font-weight: 800; cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; }
      .site-thumbnail-button, .site-title-button { min-height: auto; border: 0; background: transparent; color: var(--sites-text); padding: 0; }
      .site-thumbnail-button { display: block; width: 124px; height: 74px; }
      .site-title-button { display: block; width: 100%; text-align: left; justify-content: flex-start; font-size: var(--xui-font-size-md, 16px); line-height: 1.2; font-weight: 750; overflow-wrap: anywhere; }
      button:disabled { opacity: .55; cursor: not-allowed; }
      .icon-button { width: 32px; padding: 0; flex: 0 0 auto; font-size: 17px; }
      .svg-icon { width: 17px; height: 17px; flex: 0 0 auto; }
      .primary-action { margin-top: 8px; color: var(--sites-primary-foreground); background: var(--sites-primary); border-color: var(--sites-primary); }
      .notice { margin: 8px 12px 0; padding: 8px 10px; border-radius: var(--sites-radius-md); font-weight: 700; border: 1px solid var(--sites-border); background: transparent; }
      .notice.success { color: var(--sites-success); border-color: color-mix(in srgb, var(--sites-success) 35%, var(--sites-border)); }
      .notice.error { color: var(--sites-danger); border-color: color-mix(in srgb, var(--sites-danger) 35%, var(--sites-border)); }
      .detail-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(300px, .85fr); gap: 12px; }
      .facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 12px; margin: 12px 0; }
      dt { color: var(--sites-muted); font-weight: 800; }
      dd { margin: 0; }
      .deployment-preview-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; align-items: stretch; }
      .deployment-link { width: 100%; justify-content: flex-start; overflow-wrap: anywhere; color: var(--sites-primary); }
      .preview-action { gap: 6px; white-space: nowrap; color: var(--sites-primary); }
      .button-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
      .env-grid { display: grid; grid-template-columns: 1fr 1fr auto auto; gap: 6px; align-items: center; }
      .check { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; color: var(--sites-muted); font-weight: 800; }
      .check input { width: auto; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { border-top: 1px solid var(--sites-border); padding: 7px 8px; text-align: left; vertical-align: top; }
      th { color: var(--sites-muted); font-size: var(--xui-font-size-xs, 12px); text-transform: uppercase; letter-spacing: 0; }
      td a { color: var(--sites-primary); overflow-wrap: anywhere; }
      .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
      @media (max-width: 860px) {
        .sites-list-page { padding: 12px; }
        .site-list-header { display: none; }
        .site-list-row { grid-template-columns: 104px minmax(0, 1fr); gap: 12px; min-height: 104px; }
        .site-thumbnail-button, .site-thumbnail { width: 104px; height: 68px; }
        .shared-cell, .site-row-actions { grid-column: 2; justify-content: flex-start; font-size: var(--xui-font-size-sm, 13px); }
        .site-row-actions { flex-wrap: wrap; }
        .site-title-button { font-size: var(--xui-font-size-md, 15px); }
        .site-list-meta { font-size: var(--xui-font-size-sm, 13px); }
        .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .template-drawer { margin-inline: 12px; }
        .template-dialog { grid-template-columns: 1fr; overflow: auto; }
        .template-dialog-main { min-height: 520px; }
        .detail-grid, .form-grid, .env-grid, .deployment-preview-row { grid-template-columns: 1fr; }
      }
      @media (max-width: 560px) {
        .template-grid { grid-template-columns: 1fr; }
        .template-drawer-handle { grid-template-columns: 22px minmax(0, 1fr) auto 22px; padding-inline: 10px; }
        .template-dialog-overlay { padding: 10px; align-items: start; }
        .template-dialog { max-height: calc(100dvh - 20px); }
        .template-dialog-main, .template-dialog-meta { border-radius: 14px; padding: 16px; }
        .prompt-box pre { font-size: 13px; padding: 16px 42px 16px 16px; }
      }
    `
    document.head.appendChild(style)
  }

  const root = ReactDOM.createRoot(document.getElementById('root'))
  root.render(h(App))
  post('ready')
})()
