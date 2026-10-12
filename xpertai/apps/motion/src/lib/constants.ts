export const MOTION_PLUGIN_NAME = '@xpert-ai/plugin-motion'
export const MOTION_ARTIFACT_NAMESPACE = 'motion'
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
export const MOTION_RENDER_QUEUE = 'motion.render'
export const MOTION_RENDER_JOB = 'hyperframes-production'
export const MOTION_RENDER_SANDBOX_ACTION = 'motion.hyperframes-render'
export const MOTION_RENDER_SANDBOX_ACTION_VERSION = '1.0.0'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'

export const MOTION_SEARCH_RECIPES_TOOL_NAME = 'motion_search_recipes'
export const MOTION_GET_RECIPE_TOOL_NAME = 'motion_get_recipe'
export const MOTION_CREATE_PROJECT_TOOL_NAME = 'motion_create_project'
export const MOTION_CREATE_PRODUCT_INTRO_TOOL_NAME = 'motion_create_product_intro'
export const MOTION_GET_PROJECT_TOOL_NAME = 'motion_get_project'
export const MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME = 'motion_save_web_artifact'
export const MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME = 'motion_save_video_composition'
export const MOTION_SAVE_HYPERFRAMES_COMPOSITION_TOOL_NAME = 'motion_save_hyperframes_composition'
export const MOTION_FINALIZE_VERSION_TOOL_NAME = 'motion_finalize_version'
export const MOTION_EXPORT_ARTIFACT_TOOL_NAME = 'motion_export_artifact'
export const MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME = 'motion_update_project_status'
export const MOTION_REPORT_FAILURE_TOOL_NAME = 'motion_report_failure'

export const MOTION_MIDDLEWARE_TOOL_NAMES = [
  MOTION_SEARCH_RECIPES_TOOL_NAME,
  MOTION_GET_RECIPE_TOOL_NAME,
  MOTION_CREATE_PROJECT_TOOL_NAME,
  MOTION_CREATE_PRODUCT_INTRO_TOOL_NAME,
  MOTION_GET_PROJECT_TOOL_NAME,
  MOTION_SAVE_WEB_ARTIFACT_TOOL_NAME,
  MOTION_SAVE_VIDEO_COMPOSITION_TOOL_NAME,
  MOTION_SAVE_HYPERFRAMES_COMPOSITION_TOOL_NAME,
  MOTION_FINALIZE_VERSION_TOOL_NAME,
  MOTION_EXPORT_ARTIFACT_TOOL_NAME,
  MOTION_UPDATE_PROJECT_STATUS_TOOL_NAME,
  MOTION_REPORT_FAILURE_TOOL_NAME
] as const

export const MOTION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Motion"><path d="M3 20c7-19 15 11 26-9M3 25c7-19 15 11 26-9"/><path d="m22 3 5 4-5 4-5-4Z" fill="#8B5CF6" stroke="none"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
