import { PACKAGE_METADATA } from './package-metadata.js'

export const PLUGIN_NAME = PACKAGE_METADATA.name
/**
 * Root of every process-global identifier this plugin registers. Never rename after release.
 * A literal so the repository's table-name check can resolve it; a test keeps it equal to package.json.
 */
export const PLUGIN_ARTIFACT_NAMESPACE = 'photo_intake'
export const PROVIDER_KEY = 'photo-intake.workbench'
export const VIEW_KEY = 'photo-intake.cases'
export const REMOTE_ENTRY = 'photo-intake.remote'
export const FEATURE = 'photo-intake.review'
export const MIDDLEWARE_NAME = 'PhotoIntakeMiddleware'
export const TEMPLATE_KEY = 'photo-intake-assistant'
export const TEMPLATE_PROVIDER = 'photo-intake.templates'
export const ACTION_KEYS = ['create_case', 'confirm_case', 'create_run', 'retry_failures', 'recover_run', 'review_sample', 'decide_run'] as const
export const LIST_CASES_TOOL = 'photo_intake_list_cases'
export const ANALYZE_CASE_TOOL = 'photo_intake_analyze_case'
export const LIST_RUNS_TOOL = 'photo_intake_list_evaluations'
export const GET_RUN_TOOL = 'photo_intake_get_evaluation'
export const EVALUATE_NEXT_TOOL = 'photo_intake_evaluate_next'
/** Tools whose completion should refresh the workbench. */
export const MUTATING_TOOLS = [ANALYZE_CASE_TOOL, EVALUATE_NEXT_TOOL] as const
