export const CANVAS_PLUGIN_NAME = '@xpert-ai/plugin-canvas'
export const CANVAS_PROVIDER_KEY = 'canvas'
export const CANVAS_MIDDLEWARE_NAME = 'CanvasMiddleware'
export const CANVAS_TEMPLATE_PROVIDER_KEY = 'canvasTemplates'
export const CANVAS_FEATURE = 'canvas'
export const CANVAS_AGENT_CAPABILITY = 'agent-canvas'
export const CANVAS_WORKBENCH_CAPABILITY = 'canvas-workbench'
export const CANVAS_TEMPLATE_CAPABILITY = 'canvas-assistant-template'
export const CANVAS_WORKBENCH_VIEW_KEY = 'canvas_workbench'
export const CANVAS_REMOTE_ENTRY_KEY = 'canvas-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const CANVAS_CREATE_DOCUMENT_TOOL_NAME = 'canvas_create_document'
export const CANVAS_SAVE_SNAPSHOT_TOOL_NAME = 'canvas_save_snapshot'
export const CANVAS_PATCH_RECORDS_TOOL_NAME = 'canvas_patch_records'
export const CANVAS_INSERT_IMAGE_TOOL_NAME = 'canvas_insert_image'
export const CANVAS_SEARCH_DOCUMENTS_TOOL_NAME = 'canvas_search_documents'
export const CANVAS_GET_DOCUMENT_TOOL_NAME = 'canvas_get_document'
export const CANVAS_GET_RECORD_TOOL_NAME = 'canvas_get_record'
export const CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME = 'canvas_update_document_status'
export const CANVAS_REPORT_FAILURE_TOOL_NAME = 'canvas_report_failure'

export const CANVAS_MIDDLEWARE_TOOL_NAMES = [
  CANVAS_CREATE_DOCUMENT_TOOL_NAME,
  CANVAS_SAVE_SNAPSHOT_TOOL_NAME,
  CANVAS_PATCH_RECORDS_TOOL_NAME,
  CANVAS_INSERT_IMAGE_TOOL_NAME,
  CANVAS_SEARCH_DOCUMENTS_TOOL_NAME,
  CANVAS_GET_DOCUMENT_TOOL_NAME,
  CANVAS_GET_RECORD_TOOL_NAME,
  CANVAS_UPDATE_DOCUMENT_STATUS_TOOL_NAME,
  CANVAS_REPORT_FAILURE_TOOL_NAME
] as const

export const CANVAS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="40" fill="#F8FAFC"/>
  <path d="M52 72C52 60.9543 60.9543 52 72 52H184C195.046 52 204 60.9543 204 72V184C204 195.046 195.046 204 184 204H72C60.9543 204 52 195.046 52 184V72Z" fill="#FFFFFF" stroke="#0F766E" stroke-width="10"/>
  <path d="M82 96H132" stroke="#0F172A" stroke-width="10" stroke-linecap="round"/>
  <path d="M82 126H112" stroke="#64748B" stroke-width="8" stroke-linecap="round"/>
  <path d="M82 160C109 133 139 130 174 151" stroke="#0F766E" stroke-width="10" stroke-linecap="round"/>
  <circle cx="178" cy="154" r="11" fill="#14B8A6"/>
  <path d="M150 86L180 116L150 146" stroke="#2563EB" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
