export const MEETING_PLUGIN_NAME = '@xpert-ai/plugin-meeting-action-workbench'
export const MEETING_ARTIFACT_NAMESPACE = 'meeting_action_workbench'
export const MEETING_FEATURE = 'meeting-action-workbench'
export const MEETING_PROVIDER_KEY = 'meeting-action-workbench'
export const MEETING_VIEW_KEY = 'meeting_action_workbench'
export const MEETING_REMOTE_ENTRY_KEY = 'meeting-action-workbench'
export const MEETING_MIDDLEWARE_NAME = 'MeetingActionWorkbenchMiddleware'
export const MEETING_TEMPLATE_KEY = 'meeting-action-workbench-assistant'
export const MEETING_TEMPLATE_PROVIDER_KEY = 'meetingActionWorkbenchTemplates'

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const MEETING_TOOL_NAMES = {
  getContext: 'meeting_get_context',
  beginExtraction: 'meeting_begin_extraction',
  upsertDecision: 'meeting_upsert_decision',
  upsertActionItem: 'meeting_upsert_action_item',
  finalizeExtraction: 'meeting_finalize_extraction',
  reportFailure: 'meeting_report_extraction_failure',
  getExecutionContext: 'meeting_get_execution_context',
  beginExecutionReview: 'meeting_begin_execution_review',
  upsertRiskSignal: 'meeting_upsert_risk_signal',
  finalizeExecutionReview: 'meeting_finalize_execution_review',
  reportExecutionReviewFailure: 'meeting_report_execution_review_failure'
} as const

export const MEETING_MUTATION_TOOL_NAMES = [
  MEETING_TOOL_NAMES.beginExtraction,
  MEETING_TOOL_NAMES.upsertDecision,
  MEETING_TOOL_NAMES.upsertActionItem,
  MEETING_TOOL_NAMES.finalizeExtraction,
  MEETING_TOOL_NAMES.reportFailure,
  MEETING_TOOL_NAMES.beginExecutionReview,
  MEETING_TOOL_NAMES.upsertRiskSignal,
  MEETING_TOOL_NAMES.finalizeExecutionReview,
  MEETING_TOOL_NAMES.reportExecutionReviewFailure
] as const

export const MEETING_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><rect x="6" y="8" width="52" height="48" rx="12" fill="#E0F2FE"/><path d="M18 22h28M18 32h17M18 42h12" stroke="#0369A1" stroke-width="4" stroke-linecap="round"/><path d="m38 40 4 4 8-10" stroke="#0F766E" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
