export const STORY_STUDIO_PLUGIN_NAME = '@xpert-ai/plugin-story-studio'
export const STORY_STUDIO_ARTIFACT_NAMESPACE = 'story_studio'
export const STORY_STUDIO_PROVIDER_KEY = STORY_STUDIO_ARTIFACT_NAMESPACE
export const STORY_STUDIO_MIDDLEWARE_NAME = 'StoryStudioMiddleware'
export const STORY_STUDIO_TEMPLATE_PROVIDER_KEY = 'storyStudioTemplates'
export const STORY_STUDIO_FEATURE = 'story-studio'
export const STORY_STUDIO_AGENT_CAPABILITY = 'story-production-agent'
export const STORY_STUDIO_WORKBENCH_CAPABILITY = 'story-studio-workbench'
export const STORY_STUDIO_TEMPLATE_CAPABILITY = 'story-studio-assistant-template'
export const STORY_STUDIO_WORKBENCH_VIEW_KEY =
  `${STORY_STUDIO_ARTIFACT_NAMESPACE}_workbench`
export const STORY_STUDIO_REMOTE_ENTRY_KEY = 'story-studio-workbench'
export const ASSISTANT_CONTEXT_SET_COMMAND = 'assistant.context.set'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND =
  'assistant.chat.send_message'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const STORY_CREATE_PROJECT_TOOL_NAME = 'story_create_project'
export const STORY_SEARCH_PROJECTS_TOOL_NAME = 'story_search_projects'
export const STORY_GET_PROJECT_SUMMARY_TOOL_NAME = 'story_get_project_summary'
export const STORY_UPDATE_PROJECT_TOOL_NAME = 'story_update_project'
export const STORY_UPDATE_PROJECT_STATUS_TOOL_NAME = 'story_update_project_status'
export const STORY_REPORT_FAILURE_TOOL_NAME = 'story_report_failure'
export const STORY_SAVE_PRODUCTION_TOOL_NAME = 'story_save_production'
export const STORY_GET_PRODUCTION_TOOL_NAME = 'story_get_production'
export const STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME =
  'story_attach_generated_video'
export const STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME =
  'story_attach_generated_asset_image'
export const STORY_PREPARE_CUT_HANDOFF_TOOL_NAME =
  'story_prepare_cut_handoff'
export const STORY_GET_CUT_HANDOFF_TOOL_NAME = 'story_get_cut_handoff'
export const STORY_RECORD_CUT_HANDOFF_TOOL_NAME =
  'story_record_cut_handoff_delivery'

export const STORY_STUDIO_MIDDLEWARE_TOOL_NAMES = [
  STORY_CREATE_PROJECT_TOOL_NAME,
  STORY_SEARCH_PROJECTS_TOOL_NAME,
  STORY_GET_PROJECT_SUMMARY_TOOL_NAME,
  STORY_UPDATE_PROJECT_TOOL_NAME,
  STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
  STORY_REPORT_FAILURE_TOOL_NAME,
  STORY_SAVE_PRODUCTION_TOOL_NAME,
  STORY_GET_PRODUCTION_TOOL_NAME,
  STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME,
  STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
  STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
  STORY_GET_CUT_HANDOFF_TOOL_NAME,
  STORY_RECORD_CUT_HANDOFF_TOOL_NAME
] as const

export const STORY_STUDIO_MUTATION_TOOL_NAMES = [
  STORY_CREATE_PROJECT_TOOL_NAME,
  STORY_UPDATE_PROJECT_TOOL_NAME,
  STORY_UPDATE_PROJECT_STATUS_TOOL_NAME,
  STORY_REPORT_FAILURE_TOOL_NAME,
  STORY_SAVE_PRODUCTION_TOOL_NAME,
  STORY_ATTACH_GENERATED_ASSET_IMAGE_TOOL_NAME,
  STORY_ATTACH_GENERATED_VIDEO_TOOL_NAME,
  STORY_PREPARE_CUT_HANDOFF_TOOL_NAME,
  STORY_RECORD_CUT_HANDOFF_TOOL_NAME
] as const

export const STORY_STUDIO_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect x="24" y="24" width="208" height="208" rx="40" fill="#F5F3FF"/>
  <path d="M62 72C62 62.059 70.059 54 80 54H176C185.941 54 194 62.059 194 72V184C194 193.941 185.941 202 176 202H80C70.059 202 62 193.941 62 184V72Z" fill="#FFFFFF" stroke="#7C3AED" stroke-width="12"/>
  <path d="M92 90H164" stroke="#312E81" stroke-width="12" stroke-linecap="round"/>
  <path d="M92 122H142" stroke="#8B5CF6" stroke-width="10" stroke-linecap="round"/>
  <path d="M92 154H124" stroke="#A78BFA" stroke-width="10" stroke-linecap="round"/>
  <path d="M151 139L182 157L151 175V139Z" fill="#F97316"/>
  <path d="M84 54V202" stroke="#DDD6FE" stroke-width="6"/>
</svg>`
