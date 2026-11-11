export const ONTOAGENT_PLUGIN_NAME = '@xpert-ai/plugin-ontoagent'
export const ONTOAGENT_PROVIDER_KEY = 'ontoagent'
export const ONTOAGENT_MIDDLEWARE_NAME = 'OntoAgentGovernedContextMiddleware'
export const ONTOAGENT_FEATURE = 'ontoagent-governed-context'
export const ONTOAGENT_VIEW_KEY = 'ontoagent_governed_workbench'
export const ONTOAGENT_REMOTE_ENTRY_KEY = 'governed-workbench'
export const ONTOAGENT_TEMPLATE_PROVIDER_KEY = 'ontoagentTemplates'
export const ONTOAGENT_TEMPLATE_KEY = 'ontoagent-governed-assistant'
export const ONTOAGENT_TEMPLATE_FILE = 'xpert-ontoagent-assistant.yaml'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** 只读工具：auto 模式也注册；不产生任何本体写入入口。 */
export const ONTOAGENT_READONLY_TOOL_NAMES = [
  'ontology_prepare',
  'ontology_slice',
  'ontology_query',
  'ontology_search'
]

/** local 产线工具：生成/导入/提交/转交；auto 模式不注册。 */
export const ONTOAGENT_WRITE_TOOL_NAMES = [
  'ontology_generate',
  'ontology_import',
  'ontology_commit',
  'ontology_seed',
  'ontology_transfer',
  'ontology_transfer_inbox'
]

export const ONTOAGENT_MIDDLEWARE_TOOL_NAMES = [
  ...ONTOAGENT_READONLY_TOOL_NAMES,
  ...ONTOAGENT_WRITE_TOOL_NAMES
]

export const ONTOAGENT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/><path d="m8.5 7.5 2 7M15.5 7.5l-2 7M9 6h6"/></svg>'
