export const SITES_PLUGIN_NAME = '@xpert-ai/plugin-sites'
export const SITES_ARTIFACT_NAMESPACE = 'sites'
export const SITES_PROVIDER_KEY = 'sites'
export const SITES_MIDDLEWARE_NAME = 'SitesMiddleware'
export const SITES_FEATURE = 'sites-core'
export const SITES_VIEW_KEY = 'sites_workbench'
export const SITES_REMOTE_ENTRY_KEY = 'sites-workbench'
export const SITES_TEMPLATE_PROVIDER_KEY = 'sitesTemplates'
export const WORKBENCH_BROWSER_PREVIEW_EVENT_TYPE = 'workbench.browser.preview'
export const WORKBENCH_BROWSER_OPEN_CLIENT_COMMAND = 'workbench.browser.open'
export const ASSISTANT_CHAT_SEND_MESSAGE_COMMAND = 'assistant.chat.send_message'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const SITES_MIDDLEWARE_TOOL_NAMES = [
  'sites_create_project',
  'sites_save_version',
  'sites_deploy_version',
  'sites_create_and_deploy',
  'sites_publish_artifact_link',
  'sites_revoke_artifact_link',
  'sites_list_projects',
  'sites_inspect_project',
  'sites_set_access',
  'sites_upsert_environment_value',
  'sites_remove_environment_value',
  'sites_check_deployment_status'
]

export const SITES_ICON =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="256" height="256" fill="none" stroke="#4F46E5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sites"><path d="M26 18v9H4V5h13M4 11h13"/><path d="M9 8h.01M13 8h.01"/><path d="M20 4h9v9M29 4 17 16" stroke="#8185DC"/><path d="M9 18h4M9 23h11"/></svg>`

/** First marketplace screenshot; declared in the bundle manifest for host asset resolution. */
export const APP_COVER = './assets/branding/cover-v1.webp'
