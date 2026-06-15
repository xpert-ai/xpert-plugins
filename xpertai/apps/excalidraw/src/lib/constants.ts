export const EXCALIDRAW_PLUGIN_NAME = '@xpert-ai/plugin-excalidraw'
export const EXCALIDRAW_PROVIDER_KEY = 'excalidraw'
export const EXCALIDRAW_MIDDLEWARE_NAME = 'ExcalidrawMiddleware'
export const EXCALIDRAW_TEMPLATE_PROVIDER_KEY = 'excalidrawTemplates'
export const EXCALIDRAW_FEATURE = 'excalidraw'
export const EXCALIDRAW_AGENT_DRAWING_CAPABILITY = 'agent-drawing'
export const EXCALIDRAW_WORKBENCH_CAPABILITY = 'diagram-workbench'
export const EXCALIDRAW_TEMPLATE_CAPABILITY = 'excalidraw-assistant-template'
export const EXCALIDRAW_WORKBENCH_VIEW_KEY = 'excalidraw_workbench'
export const EXCALIDRAW_REMOTE_ENTRY_KEY = 'excalidraw-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const EXCALIDRAW_CREATE_DRAWING_TOOL_NAME = 'excalidraw_create_drawing'
export const EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME = 'excalidraw_save_scene_version'
export const EXCALIDRAW_PATCH_SCENE_TOOL_NAME = 'excalidraw_patch_scene'
export const EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME = 'excalidraw_save_mermaid_draft'
export const EXCALIDRAW_SEARCH_DRAWINGS_TOOL_NAME = 'excalidraw_search_drawings'
export const EXCALIDRAW_GET_DRAWING_TOOL_NAME = 'excalidraw_get_drawing'
export const EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME = 'excalidraw_update_drawing_status'
export const EXCALIDRAW_REPORT_FAILURE_TOOL_NAME = 'excalidraw_report_failure'

export const EXCALIDRAW_MIDDLEWARE_TOOL_NAMES = [
  EXCALIDRAW_CREATE_DRAWING_TOOL_NAME,
  EXCALIDRAW_SAVE_SCENE_VERSION_TOOL_NAME,
  EXCALIDRAW_PATCH_SCENE_TOOL_NAME,
  EXCALIDRAW_SAVE_MERMAID_DRAFT_TOOL_NAME,
  EXCALIDRAW_SEARCH_DRAWINGS_TOOL_NAME,
  EXCALIDRAW_GET_DRAWING_TOOL_NAME,
  EXCALIDRAW_UPDATE_DRAWING_STATUS_TOOL_NAME,
  EXCALIDRAW_REPORT_FAILURE_TOOL_NAME
] as const

export const EXCALIDRAW_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="40" fill="#F8FAFC"/>
  <rect x="44" y="52" width="168" height="124" rx="18" fill="#FFFFFF" stroke="#2563EB" stroke-width="9"/>
  <path d="M76 92H132" stroke="#0F172A" stroke-width="10" stroke-linecap="round"/>
  <path d="M76 124H112" stroke="#64748B" stroke-width="8" stroke-linecap="round"/>
  <path d="M154 86L184 116L154 146" stroke="#14B8A6" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M74 202C96 178 124 172 158 185C170 190 184 190 196 180" stroke="#2563EB" stroke-width="10" stroke-linecap="round"/>
  <circle cx="68" cy="202" r="10" fill="#14B8A6"/>
  <circle cx="202" cy="178" r="10" fill="#14B8A6"/>
</svg>`
