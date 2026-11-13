import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const WEEKLY_RADAR_PLUGIN_NAME = '@xpert-ai/plugin-weekly-radar' as const
export const WEEKLY_RADAR_ARTIFACT_NAMESPACE = 'weekly_radar' as const

export const WEEKLY_RADAR_FEATURE = 'weekly-radar' as const
export const WEEKLY_RADAR_PROVIDER_KEY = 'weekly-radar-view-provider' as const
export const WEEKLY_RADAR_TEMPLATE_PROVIDER_KEY = 'weekly-radar-template-provider' as const
export const WEEKLY_RADAR_TEMPLATE_KEY = 'weekly-radar-assistant' as const
export const WEEKLY_RADAR_MIDDLEWARE_NAME = 'weekly-radar' as const
export const WEEKLY_RADAR_VIEW_KEY = 'weekly_radar_workbench' as const
export const WEEKLY_RADAR_REMOTE_ENTRY_KEY = 'weekly-radar-workbench' as const

export const WEEKLY_RADAR_TABLES = {
  entry: pluginArtifactTableName(WEEKLY_RADAR_ARTIFACT_NAMESPACE, 'entry'),
  weekly: pluginArtifactTableName(WEEKLY_RADAR_ARTIFACT_NAMESPACE, 'weekly')
} as const

export const WEEKLY_RADAR_TOOL_NAMES = {
  upsertEntry: 'radar_upsert_entry',
  scanRisks: 'radar_scan_risks',
  generateWeekly: 'radar_generate_weekly',
  confirmWeekly: 'radar_confirm_weekly',
  listEntries: 'radar_list_entries'
} as const

export const WEEKLY_RADAR_TOOL_NAME_LIST = [
  WEEKLY_RADAR_TOOL_NAMES.upsertEntry,
  WEEKLY_RADAR_TOOL_NAMES.scanRisks,
  WEEKLY_RADAR_TOOL_NAMES.generateWeekly,
  WEEKLY_RADAR_TOOL_NAMES.confirmWeekly,
  WEEKLY_RADAR_TOOL_NAMES.listEntries
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const WEEKLY_RADAR_ICON = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="10" width="48" height="44" rx="10" fill="#0f766e"/>
  <circle cx="32" cy="32" r="15" stroke="#fff" stroke-width="4"/>
  <path d="M32 17v15l10 6" stroke="#facc15" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
