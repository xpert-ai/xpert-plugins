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
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></svg>'
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
