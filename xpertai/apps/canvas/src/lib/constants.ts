export const CANVAS_PLUGIN_NAME = '@xpert-ai/plugin-canvas'
export const CANVAS_ARTIFACT_NAMESPACE = 'canvas'
export const CANVAS_PROVIDER_KEY = 'canvas'
export const CANVAS_COLLABORATION_PROVIDER_KEY = 'canvas.document'
export const CANVAS_COLLABORATION_SCHEMA_VERSION = 1
export const CANVAS_MIDDLEWARE_NAME = 'CanvasMiddleware'
export const CANVAS_TEMPLATE_PROVIDER_KEY = 'canvasTemplates'
export const CANVAS_FEATURE = 'canvas'
export const CANVAS_AGENT_CAPABILITY = 'agent-canvas'
export const CANVAS_WORKBENCH_CAPABILITY = 'canvas-workbench'
export const CANVAS_TEMPLATE_CAPABILITY = 'canvas-assistant-template'
export const CANVAS_WORKBENCH_VIEW_KEY = 'canvas_workbench'
export const CANVAS_REMOTE_ENTRY_KEY = 'canvas-workbench'
export const CANVAS_ARTIFACT_RESOURCE_TYPE = 'canvas_readonly_viewer'
export const CANVAS_ARTIFACT_SHARE_KEY = 'readonly-default'
export const CANVAS_ARTIFACT_EXPORT_QUEUE = 'canvas.artifact-export'
export const CANVAS_ARTIFACT_EXPORT_JOB = 'render'
export const CANVAS_ARTIFACT_SANDBOX_ACTION = 'canvas.export'
export const CANVAS_ARTIFACT_SANDBOX_ACTION_VERSION = '1.0.0'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const CANVAS_CREATE_DOCUMENT_TOOL_NAME = 'canvas_create_document'
/** Legacy completion event name; full snapshots remain Workbench/import-only and are not in CANVAS_MIDDLEWARE_TOOL_NAMES. */
export const CANVAS_SAVE_SNAPSHOT_TOOL_NAME = 'canvas_save_snapshot'
export const CANVAS_PATCH_RECORDS_TOOL_NAME = 'canvas_patch_records'
export const CANVAS_INSERT_IMAGE_TOOL_NAME = 'canvas_insert_image'
export const CANVAS_SEARCH_DOCUMENTS_TOOL_NAME = 'canvas_search_documents'
export const CANVAS_GET_DOCUMENT_TOOL_NAME = 'canvas_get_document'
export const CANVAS_LIST_RECORDS_TOOL_NAME = 'canvas_list_records'
export const CANVAS_GET_RECORD_TOOL_NAME = 'canvas_get_record'
export const CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME = 'canvas_update_document_status'
export const CANVAS_REPORT_FAILURE_TOOL_NAME = 'canvas_report_failure'
export const CANVAS_PUBLISH_ARTIFACT_LINK_TOOL_NAME = 'canvas_publish_artifact_link'
export const CANVAS_REVOKE_ARTIFACT_LINK_TOOL_NAME = 'canvas_revoke_artifact_link'

export const CANVAS_MIDDLEWARE_TOOL_NAMES = [
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
  CANVAS_GET_DOCUMENT_TOOL_NAME,
  CANVAS_LIST_RECORDS_TOOL_NAME,
  CANVAS_GET_RECORD_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
  CANVAS_REPORT_FAILURE_TOOL_NAME,
  CANVAS_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  CANVAS_REVOKE_ARTIFACT_LINK_TOOL_NAME
] as const

export const CANVAS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#0F766E" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Canvas"><path d="M5 11V6h5M22 6h5v5M27 22v5h-5M10 27H5v-5"/><rect x="10" y="10" width="9" height="9" rx="2"/><path d="m20 16 6 6-6 6-6-6Z" fill="#EBA879" stroke="none"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
