import { readFileSync } from 'fs'
import { join } from 'path'
import vm from 'vm'

describe('smart maintenance remote component', () => {
  function readAppScript() {
    return readFileSync(join(__dirname, 'remote-components', 'smart-maintenance', 'app.js'), 'utf8')
  }

  function loadAppTestHooks() {
    const script = readAppScript().replace(
      "  const rootElement = document.getElementById('root')",
      "  globalThis.__smartMaintenanceTestHooks = { isNewServiceData, isNewWorkOrder, isAfterBaseline, buildImportFeedback }\n  const rootElement = document.getElementById('root')"
    )
    const sandbox = {
      globalThis: {} as Record<string, unknown>,
      React: {
        createElement: jest.fn((type, props, ...children) => ({ type, props, children }))
      },
      ReactDOM: {
        createRoot: jest.fn(() => ({ render: jest.fn() })),
        render: jest.fn()
      },
      document: {
        createElement: jest.fn(() => ({})),
        getElementById: jest.fn(() => ({})),
        head: {
          appendChild: jest.fn()
        }
      },
      window: {
        addEventListener: jest.fn(),
        innerHeight: 800,
        setTimeout: jest.fn()
      },
      parent: {
        postMessage: jest.fn()
      },
      ResizeObserver: jest.fn()
    }
    sandbox.globalThis = sandbox as never
    vm.runInNewContext(script, sandbox)
    return sandbox.globalThis.__smartMaintenanceTestHooks as {
      isNewServiceData: (serviceData: { id?: string; importedAt?: string; createdAt?: string }, baselineId?: string, startedAt?: string) => boolean
      isNewWorkOrder: (workOrder: { id?: string; createdAt?: string }, baselineId?: string, startedAt?: string) => boolean
    }
  }

  it('renders the redesigned workbench with the import and service range entry points', () => {
    const script = readAppScript()

    expect(script).toContain('智能维保工作台')
    expect(script).toContain('上传数据文件')
    expect(script).not.toContain('进入详情')
    expect(script).toContain('服务范围与候选数据')
    expect(script).not.toContain("invokeClientCommand('workbench.fixed_view.open'")
  })

  it('sends report creation to the assistant instead of directly saving a workbench order', () => {
    const script = readAppScript()

    expect(script).toContain('prepare_report_chat_message')
    expect(script).toContain('invokeClientCommand')
    expect(script).toContain('assistant.chat.send_message')
    expect(script).not.toContain("executeAction('save_report_work_order'")
  })

  it('uploads service data through a file action and sends an assistant import task', () => {
    const script = readAppScript()

    expect(script).toContain('executeFileAction')
    expect(script).toContain('prepare_service_data_import')
    expect(script).toContain('smart_maintenance_import_service_data')
    expect(script).toContain('已发送给智能体解析导入')
  })

  it('treats service scope fields as optional hints for agent extraction', () => {
    const script = readAppScript()

    expect(script).toContain('智能报修识别 + 可选线索')
    expect(script).toContain('客户 / 项目 / 场所为可选线索')
    expect(script).toContain("comboField('客户名称', props.form.customerName, props.catalogSummary.customers, (value) => props.onUpdateForm('customerName', value))")
    expect(script).toContain("comboField('项目名称', props.form.projectName, props.catalogSummary.projects, (value) => props.onUpdateForm('projectName', value))")
    expect(script).toContain("comboField('场所名称', props.form.siteName, props.catalogSummary.locations, (value) => props.onUpdateForm('siteName', value))")
  })

  it('places the smart report recognition field before optional scope hints', () => {
    const script = readAppScript()

    expect(script.indexOf("textareaField('智能报修识别'")).toBeGreaterThan(-1)
    expect(script.indexOf("textareaField('智能报修识别'")).toBeLessThan(script.indexOf("comboField('客户名称'"))
    expect(script).toContain('客户/项目/场所可不填，AI 会优先从服务数据和报修描述中自动匹配。')
  })

  it('starts the report form empty so users can submit natural language without manual scope hints', () => {
    const script = readAppScript()

    expect(script).toContain('React.useState(() => createEmptyReportForm())')
    expect(script).toContain('onFillSample: () => setForm(Object.assign({}, SAMPLE_REPORT))')
  })

  it('renders service range and AI feedback panels on the home page', () => {
    const script = readAppScript()

    expect(script).toContain('当前服务项目范围')
    expect(script).toContain('查看服务范围')
    expect(script).toContain('AI 反馈结果')
    expect(script).toContain('生成成功后会在这里显示最新工单号；需要补充时会提示缺少的信息。')
  })

  it('polls view data after sending agent tasks so AI feedback can show tool results', () => {
    const script = readAppScript()

    expect(script).toContain('startAgentResultPolling')
    expect(script).toContain("startAgentResultPolling('report'")
    expect(script).toContain("startAgentResultPolling('import'")
    expect(script).toContain('latestServiceData')
    expect(script).toContain('AGENT_RESULT_POLL_INTERVAL_MS')
    expect(script).toContain('状态：')
  })

  it('clears stale loading notices and hides low-level HTTP 0 refresh errors from users', () => {
    const script = readAppScript()

    expect(script).toContain('formatWorkbenchLoadError')
    expect(script).toContain("setNotice('')")
    expect(script).toContain("setNotice(formatWorkbenchLoadError(error))")
    expect(script).toContain('刷新被中断，请稍后重试。')
    expect(script).toContain('Http failure response')
    expect(script).toContain('Unknown Error')
  })

  it('treats changed service data id as an import result even when agent timestamps are not comparable to the frontend baseline', () => {
    const hooks = loadAppTestHooks()

    expect(
      hooks.isNewServiceData(
        { id: 'service-data-new', importedAt: '2026-06-04T09:20:00.000Z' },
        'service-data-old',
        '2026-06-04T09:24:00.000Z'
      )
    ).toBe(true)
    expect(
      hooks.isNewServiceData(
        { id: 'service-data-old', importedAt: '2026-06-04T09:24:01.000Z' },
        'service-data-old',
        '2026-06-04T09:24:00.000Z'
      )
    ).toBe(false)
  })

  it('prefers uploaded catalog scope values over work order fallback values', () => {
    const script = readAppScript()

    expect(script).toContain('const catalogCustomers = uniqueCatalogLabels(catalog.customers)')
    expect(script).toContain('const catalogProjects = uniqueCatalogLabels(catalog.projects)')
    expect(script).toContain('const catalogLocations = uniqueCatalogLabels(catalog.locations)')
    expect(script).toContain('customers: catalogCustomers.length ? catalogCustomers : itemCustomers.length ? itemCustomers')
    expect(script).toContain('projects: catalogProjects.length ? catalogProjects : itemProjects.length ? itemProjects')
    expect(script).toContain('locations: catalogLocations.length ? catalogLocations : itemLocations')
  })

  it('does not render a tab menu above the service scope data page', () => {
    const script = readAppScript()

    expect(script).toContain('服务范围与候选数据')
    expect(script).not.toContain('sm-tabs')
    expect(script).not.toContain("'客户/项目/场所', '设备目录', '故障分类', '处理部门', '岗位人员', '备件目录'")
  })

  it('reports iframe height from its own shell content instead of the parent-sized body', () => {
    const script = readAppScript()

    expect(script).not.toContain('document.body.scrollHeight')
    expect(script).toContain('shell.getBoundingClientRect().height')
  })
})
