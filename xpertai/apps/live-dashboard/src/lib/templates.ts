import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { DASHBOARD_PROJECT_TYPE } from './project'
import { dashboardIcon } from './dashboard-icon'
import { dashboardWorkspacePrompts } from './prompt-workflows'

const startPrompts = [
  "请读取 live-dashboard 技能中 regional-sales 的完整配方，使用该配方随附的演示文件和标准图表定义，在当前项目新建区域销售看板。核对区域筛选、销售额和明细；不要使用其他样例或项目中已有的不同数据替代。完成实际查询与两个筛选验证后保存草稿，保留演示标识，不发布。",
  "请读取 live-dashboard 技能中 sales-overview 的完整配方，使用该配方随附的演示文件和完整页面，在当前项目新建销售总览看板。包含销售额、订单数、日趋势、区域筛选和明细；不要使用其他样例或项目中已有的不同数据替代。完成实际查询与两个筛选验证后保存草稿，保留演示标识，不发布。",
  "请读取 live-dashboard 技能中 production-quality 的完整配方，使用该配方随附的演示文件和完整页面，在当前项目新建生产质量看板。必须包含产量、良品数、加权良品率、不良品数和产线筛选；不要将销售数据或其他看板改名替代。完成实际查询与两个产线筛选验证后保存草稿，保留演示标识，不发布。",
  "请读取 live-dashboard 技能中的 themes/README.md 和 superstore 完整配方（总览使用 Trend Workspace、盈利使用 Profit Atlas、客户退货使用 Customer Brief），在当前项目使用已授权的 Data Xpert SuperstoreOrders 发布模型，分别制作经营总览、商品盈利、客户与退货三个看板。必须保留演示标识；先核对全量及区域、年份、品类筛选，再按完整 HTML 和全部 Binding 保存三个草稿，不发布。若模型不可用，请说明数据准备步骤，不得用其他样例或自造数据替代。",
  "使用我的业务数据制作看板，先检查当前项目可用的数据及指标口径。"
]

const startLabels = ['区域销售 · 入门', '销售总览 · 入门', '生产质量 · 入门', 'Superstore 企业分析 · 进阶', '使用我的数据']

const dsl = (monitor: boolean) => JSON.stringify({
  team: { name: monitor ? 'live-dashboard-monitor' : 'live-dashboard-assistant', type: 'agent',
    title: monitor ? '看板巡检' : '实时看板助理', version: '1', agent: { key: 'Agent_Dashboard' },
    options: { workspaceScope: { mode: 'project-required', projectType: DASHBOARD_PROJECT_TYPE } },
    features: monitor ? {} : { sandbox: { enabled: true }, opener: { enabled: true,
      message: '选择或创建项目，从样例开始，或连接你的业务数据制作实时看板。', questions: startPrompts.map((prompt, index) => ({ label: startLabels[index], prompt })) } },
    // Reading a recipe, registering its file and validating filters spans multiple graph steps per tool call.
    agentConfig: { recursionLimit: monitor ? 100 : 300 }, workspaceDataScope: 'shared', knowledgebases: [], toolsets: [], tags: [] },
  nodes: [
    { type: 'agent', key: 'Agent_Dashboard', position: { x: 200, y: 100 }, entity: { key: 'Agent_Dashboard',
      name: monitor ? 'dashboard-monitor' : 'dashboard-author', title: monitor ? '看板巡检' : '看板制作',
      prompt: monitor
        ? 'Inspect explicitly selected published dashboards in the current Project. Use dashboard_inspect to check live bindings as the scheduled run actor. Report failed bindings, incomplete results and the observed freshness; never claim business-data freshness from query time alone. Do not change definitions, publish, or expand access. Only schedule work when the human requests it. Use the user language.'
        : 'Create and maintain dashboards in the current Project. Read the live-dashboard skill before authoring. For example requests use read_skill_file to read examples/catalog.json and the selected recipe directly relative to the catalog SKILL.md path; do not list sandbox directories to locate bundled files. After a successful draft receipt, report the receipt and let the user open its emitted card; do not reopen/update an unchanged dashboard merely to verify the save. Ask whether to use labeled synthetic demo data or authorized real data when unspecified. Small onboarding demo files belong to the current Project and use file.table after registration. The Superstore enterprise recipe instead requires the authorized published Data Xpert ontology; follow its own setup and query plans, never replace it with file.table or other sample rows. Never substitute demo values for missing real data. For enterprise BI pages, read themes/README.md, choose one visual style appropriate to the requested analysis and read its guide and complete recipe. The Superstore suite uses Trend Workspace for overview, Profit Atlas for profitability and Customer Brief for customers and returns. Use echarts plus exactly one matching theme library, adapt chart fields to discovered data, and preserve the selected theme on edits unless a redesign is requested. Discover registered data sources and validate exact bindings. Preserve the selected Artifact, component IDs and current draft revision on edits. Saving is not publication. Publication requires a manager in the Workbench. Never infer another dashboard from titles or recency. Use the user language.',
      collaboratorNames: [], toolsetIds: [], knowledgebaseIds: [] } },
    ...(monitor ? ['LiveDashboardMonitor', 'scheduler'] : ['LiveDashboard', 'SandboxFile', 'skillsMiddleware']).map((provider, index) => ({
      type: 'workflow', key: `Middleware_${provider}`, position: { x: 550, y: 100 + index * 120 },
      entity: { type: 'middleware', key: `Middleware_${provider}`, title: provider, provider, required: true,
        ...(provider === 'LiveDashboard' ? { options: { maxModelCalls: 64 } } : {}) }
    }))
  ],
  connections: (monitor ? ['LiveDashboardMonitor', 'scheduler'] : ['LiveDashboard', 'SandboxFile', 'skillsMiddleware']).map(provider => ({
    type: 'workflow', key: `Agent_Dashboard/Middleware_${provider}`, from: 'Agent_Dashboard', to: `Middleware_${provider}`, required: true
  }))
})

export const dashboardTemplates: XpertTemplateContribution[] = [false, true].map(monitor => ({
  key: monitor ? 'live-dashboard-monitor' : 'live-dashboard-assistant',
  name: monitor ? 'Live Dashboard Monitor' : 'Live Dashboard Assistant',
  title: monitor ? '看板巡检' : '实时看板助理', type: XpertTypeEnum.Agent, icon: dashboardIcon,
  description: monitor ? '在项目内以授权身份检查正式看板，不修改或发布。' : '在项目内制作和维护看板，草稿与正式发布分离。',
  targetApps: ['xpert', 'data-xpert'], targetAppMeta: { xpert: { types: ['business-assistant'],
    capabilities: [monitor ? 'live_dashboard.monitor' : 'live_dashboard'], requiredPlugins: monitor ? ['@xpert-ai/plugin-live-dashboard'] : ['@xpert-ai/plugin-live-dashboard', '@xpert-ai/plugin-analytics-files'] } },
  dependencies: { plugins: monitor ? ['@xpert-ai/plugin-live-dashboard'] : ['@xpert-ai/plugin-live-dashboard', '@xpert-ai/plugin-analytics-files'],
    skills: monitor ? [] : ['live-dashboard', 'bpc', 'bpc-cost-expense'].map(componentKey => ({
      componentKey, targetAgentKey: 'Agent_Dashboard'
    })) },
  category: 'Analytics',
  promptWorkflows: monitor ? undefined : dashboardWorkspacePrompts,
  startPrompts: monitor ? [] : startPrompts,
  releaseNotes: monitor ? undefined : 'Bundles the BPC parent and cost/expense model skills with the author template. Compatible model instances reuse the same semantic rules through environment-specific mappings; existing dashboards and Assistant configurations are not rewritten.',
  dslContent: dsl(monitor), default: false, order: monitor ? 36 : 35
}))
