export const PLUGIN_NAME = '@community/apps-testcase-workbench'
export const PLUGIN_NAMESPACE = 'testcase'
export const PROVIDER_KEY = 'testcase.workbench'
export const VIEW_KEY = 'testcase.workspace'
export const REMOTE_ENTRY = 'testcase.remote'
export const FEATURE = 'testcase.generation'
export const MIDDLEWARE_NAME = 'TestCaseWorkbenchMiddleware'
export const PERSIST_TOOL = 'testcase_persist_draft'
export const APPEND_COMMAND = 'assistant.composer.append_references'
// Toolbar actions exposed to the host view. Order is fixed by the manifest.
export const ACTION_KEYS = ['save_requirement', 'confirm_cases', 'discard_cases'] as const
export type ActionKey = (typeof ACTION_KEYS)[number]
