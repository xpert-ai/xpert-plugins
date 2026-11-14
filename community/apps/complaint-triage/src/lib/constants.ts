export const PLUGIN_NAME = '@community/apps-complaint-triage'

// Root of every plugin-owned artifact identifier (tables, provider/view keys, features).
// Never rename after release: it changes table ownership and registered keys.
export const PLUGIN_NAMESPACE = 'complaint_triage'
export const pluginArtifactKey = (localKey: string) => `${PLUGIN_NAMESPACE}.${localKey}`

export const PROVIDER_KEY = pluginArtifactKey('workbench')
export const VIEW_KEY = pluginArtifactKey('desk')
export const REMOTE_ENTRY = pluginArtifactKey('remote')
export const FEATURE = pluginArtifactKey('triage')
export const TEMPLATE_PROVIDER_KEY = pluginArtifactKey('templates')
export const TEMPLATE_KEY = 'complaint-triage-assistant'
export const MIDDLEWARE_NAME = 'ComplaintTriageMiddleware'

export const TOOL_GET_TICKET = 'complaint_get_ticket'
export const TOOL_SAVE_ANALYSIS = 'complaint_save_analysis'
export const TOOL_REPORT_FAILURE = 'complaint_report_failure'
export const TOOL_NAMES = [TOOL_GET_TICKET, TOOL_SAVE_ANALYSIS, TOOL_REPORT_FAILURE] as const

export const ACTION_KEYS = ['create_ticket', 'request_analysis', 'report_dispatch_failure', 'confirm_ticket'] as const
export type ActionKey = (typeof ACTION_KEYS)[number]

// The Workbench cannot observe a failed or abandoned Assistant run, so an analysis that produces no
// tool result within this window is expired to `analysis_failed` (code `timeout`) and becomes retryable.
export const ANALYSIS_TIMEOUT_MS = 180_000
