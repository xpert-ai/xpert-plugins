export const TEST_CASE_GENERATOR_PLUGIN_NAME = '@community/apps-test-case-generator'
export const TEST_CASE_GENERATOR_PROVIDER_KEY = 'test_case_generator'
export const TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY = 'workbench'
export const TEST_CASE_GENERATOR_HISTORY_VIEW_KEY = 'history'
export const TEST_CASE_GENERATOR_WORKBENCH_PUBLIC_VIEW_KEY = `${TEST_CASE_GENERATOR_PROVIDER_KEY}__${TEST_CASE_GENERATOR_WORKBENCH_VIEW_KEY}`
export const TEST_CASE_GENERATOR_HISTORY_PUBLIC_VIEW_KEY = `${TEST_CASE_GENERATOR_PROVIDER_KEY}__${TEST_CASE_GENERATOR_HISTORY_VIEW_KEY}`
export const TEST_CASE_GENERATOR_REMOTE_ENTRY_KEY = 'test-case-workbench'
export const TEST_CASE_GENERATOR_FEATURE = 'test_case_generator'
export const TEST_CASE_GENERATOR_MIDDLEWARE_NAME = 'TestCaseGeneratorMiddleware'
export const TEST_CASE_GENERATOR_TEMPLATE_PROVIDER_KEY = 'testCaseGeneratorTemplates'
export const TEST_CASE_GENERATE_TOOL_NAME = 'test_case_generate'
export const TEST_CASE_SAVE_TOOL_NAME = 'test_case_save_project'
export const TEST_CASE_LIST_TOOL_NAME = 'test_case_list_projects'
export const TEST_CASE_DELETE_TOOL_NAME = 'test_case_delete_project'
export const TEST_CASE_GENERATOR_MIDDLEWARE_TOOL_NAMES = [
  TEST_CASE_GENERATE_TOOL_NAME,
  TEST_CASE_SAVE_TOOL_NAME,
  TEST_CASE_LIST_TOOL_NAME,
  TEST_CASE_DELETE_TOOL_NAME
] as const
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const TEST_CASE_GENERATOR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="48" y="44" width="160" height="168" rx="16" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="8"/>
  <path d="M80 84H176" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round"/>
  <rect x="80" y="108" width="16" height="16" rx="4" fill="#DBEAFE" stroke="#1D4ED8" stroke-width="4"/>
  <path d="M108 116H176" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <rect x="80" y="140" width="16" height="16" rx="4" fill="#DBEAFE" stroke="#1D4ED8" stroke-width="4"/>
  <path d="M108 148H160" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M86 184L106 204L146 164" stroke="#22C55E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="176" cy="180" r="14" fill="#FEF3C7" stroke="#F59E0B" stroke-width="6"/>
</svg>`
