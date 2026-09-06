import { AGENT_PROFILE_TABS_SLOT, WORKBENCH_NAVIGATION_OPEN_COMMAND, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { artifactKey, PLUGIN_NAME, APP_ICON } from '../artifact-namespace.js'
import { ROLES } from '../roles.js'
import type { RoleKey } from '../contracts.js'
import type { ProfileMode } from '../profile-contracts.js'
export const PROFILE_FEATURE = artifactKey('assistant_profile')
export const PROFILE_PROVIDER = artifactKey('profile_views')
export const PROFILE_ENTRY = 'assistant-profile'
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
const labels: Record<RoleKey, [string, string, string, string]> = {
  coordinator: ['Governance activity', '治理活动', 'Awaiting approval', '待审批'],
  intake: ['Collection activity', '采集活动', 'Collection queue', '待采集'],
  engineering: ['Drawing activity', '图纸活动', 'Drawing queue', '待识别'],
  standardization: ['Standardization activity', '标准化活动', 'Standardization queue', '待标准化'],
  quality: ['Audit activity', '审计活动', 'Conflict watch', '冲突关注'],
  impact: ['Impact activity', '影响分析', 'Assessment queue', '待评估'],
  governance: ['Governance activity', '治理活动', 'Quick review', '快捷审批'],
  publisher: ['Publication activity', '发布活动', 'Publication watch', '发布关注'],
}
export const PROFILE_TABS = ROLES.flatMap(role => (['recent', 'attention'] as ProfileMode[]).map(mode => ({
  key: artifactKey(`profile_${role.key}_${mode}`), role: role.key, mode,
})))
export const profileTab = (key: string) => PROFILE_TABS.find(tab => tab.key === key)
export function profileManifests(): XpertExtensionViewManifest[] {
  return PROFILE_TABS.map(tab => {
    const role = ROLES.find(role => role.key === tab.role)!
    const names = labels[tab.role], offset = tab.mode === 'recent' ? 0 : 2
    return {
      key: tab.key, title: text(names[offset]!, names[offset + 1]!),
      hostType: 'agent', slot: AGENT_PROFILE_TABS_SLOT, order: tab.mode === 'recent' ? 10 : 20,
      icon: APP_ICON, refreshable: true,
      activation: { requiredFeatures: [PROFILE_FEATURE, role.feature] },
      source: { provider: PROFILE_PROVIDER, plugin: PLUGIN_NAME },
      view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
        component: { isolation: 'iframe', entry: PROFILE_ENTRY }, dataSource: { mode: 'platform' } },
      dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsPagination: true, defaultPageSize: 5, supportsSelection: true, supportsSearch: true } },
      clientCommands: [{ key: 'assistant.profile.interaction' }, { key: 'assistant.profile.close' }, { key: WORKBENCH_NAVIGATION_OPEN_COMMAND }],
      actions: tab.role === 'coordinator' || tab.role === 'governance' ? [{ key: 'decide_proposal', label: text('Review proposal', '审批治理方案'), actionType: 'invoke', requiredHostAccess: 'read' }] : [],
    }
  })
}
