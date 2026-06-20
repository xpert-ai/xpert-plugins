export const DRAWIO_PLUGIN_NAME = '@xpert-ai/plugin-drawio'
export const DRAWIO_PROVIDER_KEY = 'drawio'
export const DRAWIO_MIDDLEWARE_NAME = 'DrawioMiddleware'
export const DRAWIO_TEMPLATE_PROVIDER_KEY = 'drawioTemplates'
export const DRAWIO_FEATURE = 'drawio'
export const DRAWIO_AGENT_DRAWING_CAPABILITY = 'drawio-agent-drawing'
export const DRAWIO_WORKBENCH_CAPABILITY = 'drawio-workbench'
export const DRAWIO_TEMPLATE_CAPABILITY = 'drawio-assistant-template'
export const DRAWIO_WORKBENCH_VIEW_KEY = 'drawio_workbench'
export const DRAWIO_REMOTE_ENTRY_KEY = 'drawio-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const DRAWIO_CREATE_DRAWING_TOOL_NAME = 'drawio_create_diagram'
export const DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME = 'drawio_save_scene_version'
export const DRAWIO_PATCH_SCENE_TOOL_NAME = 'drawio_patch_scene'
export const DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME = 'drawio_save_mermaid_draft'
export const DRAWIO_SEARCH_DRAWINGS_TOOL_NAME = 'drawio_search_diagrams'
export const DRAWIO_GET_DRAWING_TOOL_NAME = 'drawio_get_diagram'
export const DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME = 'drawio_update_diagram_status'
export const DRAWIO_REPORT_FAILURE_TOOL_NAME = 'drawio_report_failure'

export const DRAWIO_MIDDLEWARE_TOOL_NAMES = [
  DRAWIO_CREATE_DRAWING_TOOL_NAME,
  DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME,
  DRAWIO_PATCH_SCENE_TOOL_NAME,
  DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME,
  DRAWIO_SEARCH_DRAWINGS_TOOL_NAME,
  DRAWIO_GET_DRAWING_TOOL_NAME,
  DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME,
  DRAWIO_REPORT_FAILURE_TOOL_NAME
] as const

export const DRAWIO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="40" fill="#F8FAFC"/>
  <rect x="42" y="48" width="172" height="132" rx="20" fill="#FFFFFF" stroke="#F59E0B" stroke-width="10"/>
  <rect x="72" y="84" width="46" height="34" rx="8" fill="#FEF3C7" stroke="#92400E" stroke-width="7"/>
  <rect x="144" y="84" width="46" height="34" rx="8" fill="#DBEAFE" stroke="#1D4ED8" stroke-width="7"/>
  <rect x="108" y="136" width="46" height="34" rx="8" fill="#DCFCE7" stroke="#15803D" stroke-width="7"/>
  <path d="M118 101H144" stroke="#0F172A" stroke-width="7" stroke-linecap="round"/>
  <path d="M158 118L138 136" stroke="#0F172A" stroke-width="7" stroke-linecap="round"/>
  <path d="M96 118L116 136" stroke="#0F172A" stroke-width="7" stroke-linecap="round"/>
  <path d="M76 206C99 188 126 184 154 195C170 201 187 198 202 184" stroke="#F59E0B" stroke-width="10" stroke-linecap="round"/>
</svg>`
