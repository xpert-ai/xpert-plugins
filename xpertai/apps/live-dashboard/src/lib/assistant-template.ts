import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { dashboardIcon } from './dashboard-icon'
import { dashboardWorkspacePrompts } from './prompt-workflows'

export const DASHBOARD_TEMPLATE_KEY = 'live-dashboard-assistant'
const agentKey = 'Agent_LiveDashboard'
const middlewares = [
  { key: 'Middleware_LiveDashboard', provider: 'LiveDashboard', title: '实时看板' },
  { key: 'Middleware_Skills', provider: 'skillsMiddleware', title: 'Skills' },
  { key: 'Middleware_SandboxFile', provider: 'SandboxFile', title: 'Sandbox files' }
]

// The installation wizard resolves the model and sandbox provider for the target workspace.
export const dashboardAssistantTemplate: XpertTemplateContribution = {
  key: DASHBOARD_TEMPLATE_KEY,
  name: 'Live Dashboard Assistant',
  title: { en_US: 'Live Dashboard Assistant', zh_Hans: '实时看板助手' },
  description: {
    en_US: 'Create and improve standard or HTML dashboards from authorized data, with twelve editable prompt shortcuts.',
    zh_Hans: '基于授权数据创建和优化标准或 HTML 看板，附带 12 个可编辑快捷提示词。'
  },
  icon: dashboardIcon,
  type: XpertTypeEnum.Agent,
  category: 'Analytics',
  targetApps: ['xpert'],
  dependencies: { plugins: ['@xpert-ai/plugin-live-dashboard'] },
  promptWorkflows: dashboardWorkspacePrompts,
  dslContent: JSON.stringify({
    team: {
      name: 'live-dashboard-assistant', type: 'agent', title: '实时看板助手',
      description: 'Create verified live dashboards from authorized business data.',
      agent: { key: agentKey },
      features: { sandbox: { enabled: true } },
      version: '1'
    },
    nodes: [
      {
        type: 'agent', key: agentKey, position: { x: 480, y: 40 },
        entity: {
          key: agentKey, name: 'live-dashboard-assistant', title: '实时看板助手',
          prompt: 'Use the LiveDashboard tools and installed live-dashboard skill. Discover authorized data, verify business metrics and previews, then save a draft. Report success only after a successful save receipt. Match the user language.',
          options: { middlewares: { order: middlewares.map(({ key }) => key) } },
          collaboratorNames: [], toolsetIds: [], knowledgebaseIds: []
        }
      },
      ...middlewares.map(({ key, provider, title }, index) => ({
        type: 'workflow', key, position: { x: index * 320, y: 320 },
        entity: { type: 'middleware', key, provider, title, required: true, options: {} }
      }))
    ],
    connections: middlewares.map(({ key }) => ({ type: 'workflow', key: `${agentKey}/${key}`, from: agentKey, to: key }))
  }),
  default: false,
  order: 75
}
