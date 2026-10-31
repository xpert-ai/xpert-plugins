import type { PluginMarketplaceContribution, XpertProjectTypeRef } from '@xpert-ai/contracts'
import { dashboardIcon } from './dashboard-icon'

export const DASHBOARD_PROJECT_TYPE = {
  applicationKey: '@xpert-ai/plugin-live-dashboard:live-dashboard', projectTypeKey: 'dashboard'
} as const satisfies XpertProjectTypeRef

export const dashboardApp = {
  type: 'app', name: 'live-dashboard', icon: dashboardIcon,
  displayName: { en_US: 'Live Dashboard', zh_Hans: '实时看板' },
  description: { en_US: 'Create and use live dashboards in Assistant ChatKit with a synchronized Project selection.', zh_Hans: '在助理 ChatKit 中按项目制作和使用实时看板，项目选择双向同步。' },
  projectTypes: [{ key: DASHBOARD_PROJECT_TYPE.projectTypeKey,
    title: { en_US: 'Live Dashboard project', zh_Hans: '实时看板项目' }, icon: dashboardIcon,
    binding: { kind: 'project' } }]
} satisfies PluginMarketplaceContribution

export type DashboardAccess = { project: boolean; archived: boolean; canReadDraft: boolean; canEdit: boolean; canManage: boolean }
export type DashboardMode = 'published' | 'draft'
