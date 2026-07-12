export const MOTION_PLUGIN_NAME = '@xpert-ai/plugin-motion'
export const MOTION_PROVIDER_KEY = 'motion'
export const MOTION_MIDDLEWARE_NAME = 'MotionMiddleware'
export const MOTION_TEMPLATE_PROVIDER_KEY = 'motionTemplates'
export const MOTION_FEATURE = 'motion'
export const MOTION_AGENT_CAPABILITY = 'agent-motion'
export const MOTION_WORKBENCH_CAPABILITY = 'motion-workbench'
export const MOTION_LIBRARY_CAPABILITY = 'motion-library'
export const MOTION_TEMPLATE_CAPABILITY = 'motion-assistant-template'
export const MOTION_WORKBENCH_VIEW_KEY = 'motion_workbench'
export const MOTION_REMOTE_ENTRY_KEY = 'motion-workbench'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const MOTION_SEARCH_RECIPES_TOOL_NAME = 'motion_search_recipes'
export const MOTION_GET_RECIPE_TOOL_NAME = 'motion_get_recipe'
export const MOTION_CREATE_PROJECT_TOOL_NAME = 'motion_create_project'
export const MOTION_GET_PROJECT_TOOL_NAME = 'motion_get_project'
export const MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME = 'motion_save_web_artifact'
export const MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME = 'motion_save_video_composition'
export const MOTION_FINALIZE_VERSION_TOOL_NAME = 'motion_finalize_version'
export const MOTION_EXPORT_ARTIFACT_TOOL_NAME = 'motion_export_artifact'
export const MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME = 'motion_update_project_status'
export const MOTION_REPORT_FAILURE_TOOL_NAME = 'motion_report_failure'

export const MOTION_MIDDLEWARE_TOOL_NAMES = [
  MOTION_SEARCH_RECIPES_TOOL_NAME,
  MOTION_GET_RECIPE_TOOL_NAME,
  MOTION_CREATE_PROJECT_TOOL_NAME,
  MOTION_GET_PROJECT_TOOL_NAME,
  MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
  MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
  MOTION_FINALIZE_VERSION_TOOL_NAME,
  MOTION_EXPORT_ARTIFACT_TOOL_NAME,
  MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME,
  MOTION_REPORT_FAILURE_TOOL_NAME
] as const

export const MOTION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="40" fill="#F8FAFC"/>
  <path d="M58 154C75 103 111 80 151 93C179 102 192 129 178 153C162 181 118 186 96 158" stroke="#111827" stroke-width="12" stroke-linecap="round"/>
  <path d="M64 171C92 204 151 208 188 169" stroke="#2563EB" stroke-width="12" stroke-linecap="round"/>
  <circle cx="153" cy="93" r="13" fill="#7C3AED"/>
  <circle cx="96" cy="158" r="11" fill="#14B8A6"/>
  <path d="M174 64L191 81L218 48" stroke="#F59E0B" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
