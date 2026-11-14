export const PLUGIN_NAMESPACE = 'support_triage' as const
export const PLUGIN_NAME = '@community/apps-support-triage' as const
export const artifactKey = (localKey: string) => `${PLUGIN_NAMESPACE}.${localKey}`
export const FEATURE = artifactKey('review')
export const PROVIDER_KEY = artifactKey('view-provider')
export const VIEW_KEY = artifactKey('workbench')
export const REMOTE_ENTRY = artifactKey('workbench-ui')
export const MIDDLEWARE_NAME = artifactKey('analysis')
export const TEMPLATE_KEY = 'support-triage-assistant'
export const TEMPLATE_PROVIDER = artifactKey('templates')
export const TOOL_NAMES = ['support_triage_get_ticket', 'support_triage_save_analysis', 'support_triage_report_failure'] as const
export const MUTATION_TOOL_NAMES = [TOOL_NAMES[1], TOOL_NAMES[2]] as const
export const ACTION_KEYS = ['create_ticket', 'analyze_ticket', 'confirm_ticket', 'abort_analysis'] as const
export const ANALYSIS_TIMEOUT_MS = 180_000
