import { XpertTypeEnum } from '@xpert-ai/contracts'
import type { XpertTemplateContribution } from '@xpert-ai/plugin-sdk'
import { DASHBOARD_PROJECT_TYPE } from './project'
import { dashboardIcon } from './dashboard-icon'

const dsl = JSON.stringify({
  team: { name: 'live-dashboard-assistant', type: 'agent',
    title: '实时看板助理', version: '1', agent: { key: 'Agent_Dashboard' },
    options: { workspaceScope: { mode: 'project-required', projectType: DASHBOARD_PROJECT_TYPE } },
    features: { sandbox: { enabled: true } },
    agentConfig: { recursionLimit: 100 }, workspaceDataScope: 'shared', knowledgebases: [], toolsets: [], tags: [] },
  nodes: [
    { type: 'agent', key: 'Agent_Dashboard', position: { x: 200, y: 100 }, entity: { key: 'Agent_Dashboard',
      name: 'dashboard-author', title: '看板制作',
      prompt: 'Create and maintain dashboards in the current Project. Read the live-dashboard skill before authoring. Discover registered data sources and validate exact bindings. Preserve the selected Artifact, component IDs and current draft revision on edits. Saving is not publication. Publication requires a manager in the Workbench. Never infer another dashboard from titles or recency. Use the user language.',
      collaboratorNames: [], toolsetIds: [], knowledgebaseIds: [] } },
    ...['LiveDashboard', 'SandboxFile', 'skillsMiddleware'].map((provider, index) => ({
      type: 'workflow', key: `Middleware_${provider}`, position: { x: 550, y: 100 + index * 120 },
      entity: { type: 'middleware', key: `Middleware_${provider}`, title: provider, provider, required: true }
    }))
  ],
  connections: ['LiveDashboard', 'SandboxFile', 'skillsMiddleware'].map(provider => ({
    type: 'workflow', key: `Agent_Dashboard/Middleware_${provider}`, from: 'Agent_Dashboard', to: `Middleware_${provider}`, required: true
  }))
})

export const dashboardTemplates: XpertTemplateContribution[] = [{
  key: 'live-dashboard-assistant',
  name: 'Live Dashboard Assistant',
  title: '实时看板助理', type: XpertTypeEnum.Agent, icon: dashboardIcon,
  description: '在项目内制作和维护看板，草稿与正式发布分离。',
  targetApps: ['xpert', 'data-xpert'], targetAppMeta: { xpert: { types: ['business-assistant'],
    capabilities: ['live_dashboard'], requiredPlugins: ['@xpert-ai/plugin-live-dashboard'] } },
  dslContent: dsl, default: false, order: 35
}]
