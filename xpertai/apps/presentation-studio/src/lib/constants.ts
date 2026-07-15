import { pluginArtifactTableName } from '@xpert-ai/plugin-sdk'

export const PRESENTATION_STUDIO_PLUGIN_NAME = '@xpert-ai/plugin-presentation-studio'
export const PRESENTATION_PLUGIN_NAME = PRESENTATION_STUDIO_PLUGIN_NAME
export const PRESENTATION_STUDIO_ARTIFACT_NAMESPACE = 'presentation_studio'
export const PRESENTATION_STUDIO_FEATURE = 'presentation-studio'
export const PRESENTATION_FEATURE = PRESENTATION_STUDIO_FEATURE
export const PRESENTATION_GENERATION_CAPABILITY = 'presentation-generation'
export const PRESENTATION_WORKBENCH_CAPABILITY = 'presentation-workbench'
export const PRESENTATION_COLLABORATION_CAPABILITY = 'presentation-collaboration'
export const PRESENTATION_EXPORT_CAPABILITY = 'presentation-export'
export const PRESENTATION_TEMPLATE_CAPABILITY = 'presentation-assistant-template'
export const PRESENTATION_MIDDLEWARE_NAME = 'PresentationStudioMiddleware'
export const PRESENTATION_PROVIDER_KEY = 'presentation-studio-view-provider'
export const PRESENTATION_TEMPLATE_PROVIDER_KEY = 'presentation-studio-template-provider'
export const PRESENTATION_VIEW_KEY = 'presentation_studio'
export const PRESENTATION_REMOTE_ENTRY_KEY = 'presentation-studio-workbench'
export const PRESENTATION_ASSISTANT_TEMPLATE_KEY = 'presentation-studio-assistant'
export const PRESENTATION_AGENT_KEY = 'Agent_PresentationStudio'
export const PRESENTATION_ROUTE_NAMESPACE = 'presentation-studio'
export const PRESENTATION_COLLABORATION_PROVIDER_KEY = 'presentation-studio.deck'
export const PRESENTATION_EXPORT_QUEUE = 'presentation-studio.export'
export const PRESENTATION_EXPORT_JOB = 'render'
export const PRESENTATION_SANDBOX_ACTION = 'presentation.export'
export const PRESENTATION_SANDBOX_ACTION_VERSION = '1.0.0'
export const DASHIAI_UPSTREAM_COMMIT = '69ac66443e36e11cfca4a7f30721dc71a4278d28'
export const DASHIAI_LAYOUT_COUNT = 1020
export const DASHIAI_CONTROL_COUNT = 8576
export const PRESENTATION_THEME_PACKS = [
  'theme01', 'theme02', 'theme03', 'theme04', 'theme05', 'theme06',
  'theme07', 'theme08', 'theme09', 'theme10', 'theme11', 'theme12'
] as const
export const PRESENTATION_STATUSES = ['draft', 'reviewed', 'archived', 'failed'] as const
export const PRESENTATION_SLIDE_STATUSES = ['active', 'skipped', 'deleted'] as const
export const PRESENTATION_EXPORT_KINDS = ['html', 'pdf', 'pptx'] as const
export const PRESENTATION_EXPORT_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export const PRESENTATION_VERSION_SOURCES = ['agent', 'workbench', 'collaboration', 'restore', 'system'] as const
export const PRESENTATION_TOOL_NAMES = [
  'presentation_create_deck',
  'presentation_search_decks',
  'presentation_get_deck',
  'presentation_search_layouts',
  'presentation_inspect_layouts',
  'presentation_add_slide',
  'presentation_patch_slide',
  'presentation_reorder_slides',
  'presentation_add_asset',
  'presentation_finalize_deck',
  'presentation_request_export',
  'presentation_get_export',
  'presentation_share_html',
  'presentation_update_status',
  'presentation_report_failure'
] as const

export const PRESENTATION_MUTATION_TOOL_NAMES = [
  'presentation_create_deck',
  'presentation_add_slide',
  'presentation_patch_slide',
  'presentation_reorder_slides',
  'presentation_add_asset',
  'presentation_finalize_deck',
  'presentation_request_export',
  'presentation_share_html',
  'presentation_update_status'
] as const

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'

export const PRESENTATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Presentation Studio"><rect x="7" y="9" width="50" height="38" rx="7" fill="#7c3aed"/><rect x="14" y="16" width="22" height="5" rx="2.5" fill="#ede9fe"/><rect x="14" y="26" width="14" height="3" rx="1.5" fill="#c4b5fd"/><rect x="39" y="17" width="11" height="17" rx="3" fill="#a78bfa"/><path d="M32 47v8M23 55h18" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/></svg>`

export function presentationStudioTable(key: string) {
  return pluginArtifactTableName(PRESENTATION_STUDIO_ARTIFACT_NAMESPACE, key)
}
