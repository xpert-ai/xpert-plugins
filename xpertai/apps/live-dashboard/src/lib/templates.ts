import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { DASHBOARD_PROJECT_TYPE } from './project'
import { dashboardIcon } from './dashboard-icon'

const dsl = (monitor: boolean) => JSON.stringify({
  team: { name: monitor ? 'live-dashboard-monitor' : 'live-dashboard-assistant', type: 'agent',
    title: monitor ? '看板巡检' : '实时看板助理', version: '1', agent: { key: 'Agent_Dashboard' },
    options: { workspaceScope: { mode: 'project-required', projectType: DASHBOARD_PROJECT_TYPE } },
    features: monitor ? {} : { sandbox: { enabled: true } },
    agentConfig: { recursionLimit: 100 }, workspaceDataScope: 'shared', knowledgebases: [], toolsets: [], tags: [] },
  nodes: [
    { type: 'agent', key: 'Agent_Dashboard', position: { x: 200, y: 100 }, entity: { key: 'Agent_Dashboard',
      name: monitor ? 'dashboard-monitor' : 'dashboard-author', title: monitor ? '看板巡检' : '看板制作',
      prompt: monitor
        ? 'Inspect explicitly selected published dashboards in the current Project. Use dashboard_inspect to check live bindings as the scheduled run actor. Report failed bindings, incomplete results and the observed freshness; never claim business-data freshness from query time alone. Do not change definitions, publish, or expand access. Only schedule work when the human requests it. Use the user language.'
        : 'Create and maintain dashboards in the current Project. Read the live-dashboard skill before authoring. Discover registered data sources and validate exact bindings. Preserve the selected Artifact, component IDs and current draft revision on edits. Saving is not publication. Publication requires a manager in the Workbench. Never infer another dashboard from titles or recency. Use the user language.',
      collaboratorNames: [], toolsetIds: [], knowledgebaseIds: [] } },
    ...(monitor ? ['LiveDashboardMonitor', 'scheduler'] : ['LiveDashboard', 'SandboxFile', 'skillsMiddleware']).map((provider, index) => ({
      type: 'workflow', key: `Middleware_${provider}`, position: { x: 550, y: 100 + index * 120 },
      entity: { type: 'middleware', key: `Middleware_${provider}`, title: provider, provider, required: true }
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
    capabilities: [monitor ? 'live_dashboard.monitor' : 'live_dashboard'], requiredPlugins: ['@xpert-ai/plugin-live-dashboard'] } },
  dslContent: dsl(monitor), default: false, order: monitor ? 36 : 35
}))
