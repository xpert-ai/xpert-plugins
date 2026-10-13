export const LUCIDCHART_PLUGIN_NAME = '@xpert-ai/plugin-lucidchart'
export const LUCIDCHART_ARTIFACT_NAMESPACE = 'lucidchart'
export const LUCIDCHART_PROVIDER_KEY = 'lucidchart'
export const LUCIDCHART_MIDDLEWARE_NAME = 'LucidchartMiddleware'
export const LUCIDCHART_TEMPLATE_PROVIDER_KEY = 'lucidchartTemplates'
export const LUCIDCHART_FEATURE = 'lucidchart'
export const LUCIDCHART_AGENT_DRAWING_CAPABILITY = 'lucidchart-agent-drawing'
export const LUCIDCHART_WORKBENCH_CAPABILITY = 'lucidchart-workbench'
export const LUCIDCHART_TEMPLATE_CAPABILITY = 'lucidchart-assistant-template'
export const LUCIDCHART_ARTIFACT_SHARING_CAPABILITY = 'lucidchart-artifact-sharing'
export const LUCIDCHART_WORKBENCH_VIEW_KEY = 'lucidchart_workbench'
export const LUCIDCHART_REMOTE_ENTRY_KEY = 'lucidchart-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME = 'lucidchart_create_document'
export const LUCIDCHART_SAVE_STANDARD_IMPORT_VERSION_TOOL_NAME = 'lucidchart_save_standard_import_version'
export const LUCIDCHART_PATCH_STANDARD_IMPORT_TOOL_NAME = 'lucidchart_patch_standard_import'
export const LUCIDCHART_APPLY_DIAGRAM_STAGE_TOOL_NAME = 'lucidchart_apply_diagram_stage'
export const LUCIDCHART_FINALIZE_DOCUMENT_TOOL_NAME = 'lucidchart_finalize_document'
export const LUCIDCHART_GET_DIAGRAM_PAGE_TOOL_NAME = 'lucidchart_get_diagram_page'
export const LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME = 'lucidchart_save_mermaid_draft'
export const LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME = 'lucidchart_register_external_document'
export const LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME = 'lucidchart_search_documents'
export const LUCIDCHART_GET_DOCUMENT_TOOL_NAME = 'lucidchart_get_document'
export const LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME = 'lucidchart_update_document_status'
export const LUCIDCHART_REPORT_FAILURE_TOOL_NAME = 'lucidchart_report_failure'
export const LUCIDCHART_PUBLISH_ARTIFACT_LINK_TOOL_NAME = 'lucidchart_publish_artifact_link'
export const LUCIDCHART_REVOKE_ARTIFACT_LINK_TOOL_NAME = 'lucidchart_revoke_artifact_link'

export const LUCIDCHART_MIDDLEWARE_TOOL_NAMES = [
  LUCIDCHART_CREATE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_APPLY_DIAGRAM_STAGE_TOOL_NAME,
  LUCIDCHART_FINALIZE_DOCUMENT_TOOL_NAME,
  LUCIDCHART_GET_DIAGRAM_PAGE_TOOL_NAME,
  LUCIDCHART_SAVE_MERMAID_DRAFT_TOOL_NAME,
  LUCIDCHART_REGISTER_EXTERNAL_DOCUMENT_TOOL_NAME,
  LUCIDCHART_SEARCH_DOCUMENTS_TOOL_NAME,
  LUCIDCHART_GET_DOCUMENT_TOOL_NAME,
  LUCIDCHART_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
  LUCIDCHART_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  LUCIDCHART_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  LUCIDCHART_REPORT_FAILURE_TOOL_NAME
] as const

export const LUCIDCHART_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Lucidchart"><path d="M10 16h6V8h6M16 16v8h6"/><rect x="3" y="12" width="8" height="8" rx="2"/><rect x="22" y="3" width="7" height="8" rx="2"/><path d="m25 20 5 5-5 5-5-5Z" fill="#F0B65C" stroke="none"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
