export const LUCIDCHART_PLUGIN_NAME = '@xpert-ai/plugin-lucidchart'
export const LUCIDCHART_PROVIDER_KEY = 'lucidchart'
export const LUCIDCHART_MIDDLEWARE_NAME = 'LucidchartMiddleware'
export const LUCIDCHART_TEMPLATE_PROVIDER_KEY = 'lucidchartTemplates'
export const LUCIDCHART_FEATURE = 'lucidchart'
export const LUCIDCHART_AGENT_DRAWING_CAPABILITY = 'lucidchart-agent-drawing'
export const LUCIDCHART_WORKBENCH_CAPABILITY = 'lucidchart-workbench'
export const LUCIDCHART_TEMPLATE_CAPABILITY = 'lucidchart-assistant-template'
export const LUCIDCHART_WORKBENCH_VIEW_KEY = 'lucidchart_workbench'
export const LUCIDCHART_REMOTE_ENTRY_KEY = 'lucidchart-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME = 'lucidchart_create_document'
export const LUCIDCHART_SAVE_STANDARD_IMPORT_VERSION_TOOL_NAME = 'lucidchart_save_standard_import_version'
export const LUCIDCHART_PATCH_STANDARD_IMPORT_TOOL_NAME = 'lucidchart_patch_standard_import'
export const LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME = 'lucidchart_save_mermaid_draft'
export const LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME = 'lucidchart_register_external_document'
export const LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME = 'lucidchart_search_documents'
export const LUCIDCHART_GET_DOCUMENT_TOOL_NAME = 'lucidchart_get_document'
export const LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME = 'lucidchart_update_document_status'
export const LUCIDCHART_REPORT_FAILURE_TOOL_NAME = 'lucidchart_report_failure'

export const LUCIDCHART_MIDDLEWARE_TOOL_NAMES = [
  LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_SAVE_STANDARD_IMPORT_VERSION_TOOL_NAME,
  LUCIDCHART_PATCH_STANDARD_IMPORT_TOOL_NAME,
  LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME,
  LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME,
  LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME,
  LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
  LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
  LUCIDCHART_REPORT_FAILURE_TOOL_NAME
] as const

export const LUCIDCHART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="40" fill="#F8FAFC"/>
  <rect x="44" y="52" width="168" height="124" rx="18" fill="#FFFFFF" stroke="#2563EB" stroke-width="9"/>
  <path d="M76 92H132" stroke="#0F172A" stroke-width="10" stroke-linecap="round"/>
  <path d="M76 124H112" stroke="#64748B" stroke-width="8" stroke-linecap="round"/>
  <path d="M154 86L184 116L154 146" stroke="#14B8A6" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M74 202C96 178 124 172 158 185C170 190 184 190 196 180" stroke="#2563EB" stroke-width="10" stroke-linecap="round"/>
  <circle cx="68" cy="202" r="10" fill="#14B8A6"/>
  <circle cx="202" cy="178" r="10" fill="#14B8A6"/>
</svg>`
