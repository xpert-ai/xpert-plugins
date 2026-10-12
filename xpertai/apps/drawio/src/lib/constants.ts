export const DRAWIO_PLUGIN_NAME = '@xpert-ai/plugin-drawio'
export const DRAWIO_ARTIFACT_NAMESPACE = 'drawio'
export const DRAWIO_PROVIDER_KEY = 'drawio'
export const DRAWIO_MIDDLEWARE_NAME = 'DrawioMiddleware'
export const DRAWIO_TEMPLATE_PROVIDER_KEY = 'drawioTemplates'
export const DRAWIO_FEATURE = 'drawio'
export const DRAWIO_AGENT_DRAWING_CAPABILITY = 'drawio-agent-drawing'
export const DRAWIO_WORKBENCH_CAPABILITY = 'drawio-workbench'
export const DRAWIO_TEMPLATE_CAPABILITY = 'drawio-assistant-template'
export const DRAWIO_ARTIFACT_SHARING_CAPABILITY = 'drawio-artifact-sharing'
export const DRAWIO_WORKBENCH_VIEW_KEY = 'drawio_workbench'
export const DRAWIO_REMOTE_ENTRY_KEY = 'drawio-workbench'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const DRAWIO_CREATE_DRAWING_TOOL_NAME = 'drawio_create_diagram'
export const DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME = 'drawio_save_scene_version'
export const DRAWIO_SAVE_SPEC_VERSION_TOOL_NAME = 'drawio_save_spec_version'
export const DRAWIO_PATCH_SCENE_TOOL_NAME = 'drawio_patch_scene'
export const DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME = 'drawio_save_mermaid_draft'
export const DRAWIO_SEARCH_DRAWINGS_TOOL_NAME = 'drawio_search_diagrams'
export const DRAWIO_GET_DRAWING_TOOL_NAME = 'drawio_get_diagram'
export const DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME = 'drawio_update_diagram_status'
export const DRAWIO_REPORT_FAILURE_TOOL_NAME = 'drawio_report_failure'
export const DRAWIO_PUBLISH_ARTIFACT_LINK_TOOL_NAME = 'drawio_publish_artifact_link'
export const DRAWIO_REVOKE_ARTIFACT_LINK_TOOL_NAME = 'drawio_revoke_artifact_link'

export const DRAWIO_MIDDLEWARE_TOOL_NAMES = [
  DRAWIO_CREATE_DRAWING_TOOL_NAME,
  DRAWIO_SAVE_SCENE_VERSION_TOOL_NAME,
  DRAWIO_SAVE_SPEC_VERSION_TOOL_NAME,
  DRAWIO_PATCH_SCENE_TOOL_NAME,
  DRAWIO_SAVE_MERMAID_DRAFT_TOOL_NAME,
  DRAWIO_SEARCH_DRAWINGS_TOOL_NAME,
  DRAWIO_GET_DRAWING_TOOL_NAME,
  DRAWIO_UPDATE_DRAWING_STATUS_TOOL_NAME,
  DRAWIO_PUBLISH_ARTIFACT_LINK_TOOL_NAME,
  DRAWIO_REVOKE_ARTIFACT_LINK_TOOL_NAME,
  DRAWIO_REPORT_FAILURE_TOOL_NAME
] as const

export const DRAWIO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#B76A07" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="draw.io"><path d="M16 14v5M7 22v-3h18v3" stroke="#6D4C24"/><path d="m16 3 7 6-7 6-7-6Z" fill="#F7C76C"/><rect x="3" y="22" width="8" height="7" rx="2"/><rect x="21" y="22" width="8" height="7" rx="2"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
