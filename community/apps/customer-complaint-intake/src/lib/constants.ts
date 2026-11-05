export const PLUGIN_ARTIFACT_NAMESPACE = 'customer_complaint'
export const COMPLAINT_PLUGIN_NAME = '@xpert-ai/plugin-customer-complaint-intake'
export const COMPLAINT_PROVIDER_KEY = 'customer_complaint'
export const COMPLAINT_WORKBENCH_VIEW_KEY = 'workbench'
export const COMPLAINT_REMOTE_ENTRY_KEY = 'customer-complaint'
export const COMPLAINT_FEATURE = 'customer_complaint'
export const COMPLAINT_MIDDLEWARE_NAME = 'CustomerComplaintMiddleware'
export const COMPLAINT_TEMPLATE_PROVIDER_KEY = 'customerComplaintTemplates'
export const COMPLAINT_TEMPLATE_KEY = 'customer-complaint-assistant'
export const COMPLAINT_TEMPLATE_FILE = 'xpert-customer-complaint-assistant.yaml'
export const COMPLAINT_SAVE_TOOL_NAME = 'complaint_save_intake_draft'
export const COMPLAINT_GET_TOOL_NAME = 'complaint_get_case'
export const COMPLAINT_SEARCH_TOOL_NAME = 'complaint_search_cases'
export const COMPLAINT_MIDDLEWARE_TOOL_NAMES = [
  COMPLAINT_SAVE_TOOL_NAME,
  COMPLAINT_GET_TOOL_NAME,
  COMPLAINT_SEARCH_TOOL_NAME
] as const
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const COMPLAINT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 16v-3a7 7 0 0 1 14 0v3"/><path d="M5 16a2 2 0 0 0 2 2h1v-6H7a2 2 0 0 0-2 2zM19 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2z"/><path d="M12 20h3"/></svg>`
