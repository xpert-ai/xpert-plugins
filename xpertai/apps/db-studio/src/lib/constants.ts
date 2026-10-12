export const PLUGIN = '@xpert-ai/plugin-db-studio'
export const PROVIDER = 'db_studio'
export const VIEW = 'db_studio_workbench'
export const ENTRY = 'db-studio-workbench'
export const TEMPLATE = 'db-studio-assistant'
export const FEATURES = {
  explore: 'db-studio-explore',
  changes: 'db-studio-changes',
  transfer: 'db-studio-transfer',
} as const
export const MIDDLEWARE = {
  explore: 'DbStudioExploreMiddleware',
  changes: 'DbStudioChangesMiddleware',
  transfer: 'DbStudioTransferMiddleware',
} as const
export const ICON =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#146B5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="DB Studio"><ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v17c0 5.3 22 5.3 22 0V7M5 15c0 5.3 22 5.3 22 0"/><circle cx="23" cy="24" r="2" fill="#C88C3B" stroke="none"/></svg>`
export const text = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
export const READ_TOOLS = [
  'db_studio_connections',
  'db_studio_capabilities',
  'db_studio_objects',
  'db_studio_describe',
  'db_studio_query',
  'db_studio_explain',
  'db_studio_result_page',
  'db_studio_draft',
]
export const CHANGE_TOOLS = ['db_studio_plan_change', 'db_studio_execute_plan', 'db_studio_plan_status']
export const TRANSFER_TOOLS = ['db_studio_plan_import', 'db_studio_export_page']

export const STUDIO_CONFIG='db_studio.config'

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
