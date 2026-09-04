import { AGENT_PROFILE_TABS_SLOT, type XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { FACTORY_PLUGIN_NAME, FACTORY_VIEW_PROVIDER_KEY } from './constants.js'

export const FACTORY_PROFILE_FEATURE = 'factory-assistant-profile'
export const FACTORY_PROFILE_ENTRY = 'factory-assistant-profile'
export const FACTORY_PROFILE_RECENT = 'factory-assistant-recent-cases'
export const FACTORY_PROFILE_ATTENTION = 'factory-assistant-needs-attention'
export function isFactoryProfileView(key: string) { return key === FACTORY_PROFILE_RECENT || key === FACTORY_PROFILE_ATTENTION }
const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })

export function factoryProfileManifests(): XpertExtensionViewManifest[] {
  return [
    { key: FACTORY_PROFILE_RECENT, title: text('Recent cases', '最近案件') },
    { key: FACTORY_PROFILE_ATTENTION, title: text('Needs attention', '待处理') }
  ].map((tab, index) => ({
    ...tab, hostType: 'agent', slot: AGENT_PROFILE_TABS_SLOT, order: 10 + index,
    activation: { requiredFeatures: [FACTORY_PROFILE_FEATURE] },
    source: { provider: FACTORY_VIEW_PROVIDER_KEY, plugin: FACTORY_PLUGIN_NAME },
    refreshable: true,
    view: { type: 'remote_component', runtime: 'react', protocolVersion: 1,
      dataSource: { mode: 'platform' },
      component: { isolation: 'iframe', entry: FACTORY_PROFILE_ENTRY } },
    dataSource: { mode: 'platform', cache: { enabled: false }, querySchema: { supportsPagination: true, defaultPageSize: 10, supportsSelection: true } },
    clientCommands: [
      { key: 'assistant.profile.interaction', description: text('Keep the profile open during a decision.', '决策期间保持资料卡打开。') },
      { key: 'assistant.profile.close', description: text('Close this profile and restore focus.', '关闭资料卡并恢复焦点。') }
    ],
    actions: [
      { key: 'approve_and_continue', label: text('Approve and continue', '批准并继续'), actionType: 'invoke', placement: 'row', requiredHostAccess: 'read' },
      { key: 'reject_recovery_plan', label: text('Reject', '拒绝'), actionType: 'invoke', placement: 'row', requiredHostAccess: 'read' },
      { key: 'retry_continuation', label: text('Retry continuation', '重试续跑'), actionType: 'invoke', placement: 'row', requiredHostAccess: 'read' }
    ]
  }))
}
