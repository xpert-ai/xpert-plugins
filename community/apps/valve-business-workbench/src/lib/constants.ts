export const VALVE_PLUGIN_NAME = '@xpert-ai/plugin-valve-business-workbench'
export const VALVE_ARTIFACT_NAMESPACE = 'valve_business_workbench'
export const VALVE_FEATURE = 'valve-business-workbench'
export const VALVE_PROVIDER_KEY = 'valve-business-workbench'
export const VALVE_VIEW_KEY = 'valve_business_workbench'
export const VALVE_REMOTE_ENTRY_KEY = 'valve-business-workbench'
export const VALVE_MIDDLEWARE_NAME = 'ValveBusinessWorkbenchMiddleware'
export const VALVE_TEMPLATE_PROVIDER_KEY = 'valveBusinessWorkbenchTemplates'
export const VALVE_TEMPLATE_KEY = 'valve-business-workbench-assistant'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const VALVE_TOOL_NAMES = {
  listResources: 'valve_list_resources',
  getSchema: 'valve_get_schema',
  searchObjects: 'valve_search_objects',
  getObject360: 'valve_get_object_360',
  discoverActions: 'valve_discover_actions',
  preflightAction: 'valve_preflight_action',
  listActionProposals: 'valve_list_action_proposals',
  createActionProposal: 'valve_create_action_proposal',
  getAuditTrace: 'valve_get_audit_trace'
} as const

export const VALVE_MUTATION_TOOL_NAMES = [VALVE_TOOL_NAMES.createActionProposal]

export const VALVE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h4m8 0h4"/><path d="M8 8v8l4-4-4-4Zm8 0v8l-4-4 4-4Z"/><path d="M12 4v4m-2-4h4"/><circle cx="12" cy="4" r="2"/></svg>'
