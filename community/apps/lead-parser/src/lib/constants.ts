/**
 * Lead Parser 插件常量定义
 *
 * 所有跨文件引用的字符串 KEY 集中在这里：
 * plugin 入口 / view provider / middleware / 前端远程组件 都会引用，禁止散落硬编码。
 */

/** 插件名（与 .xpertai-plugin/plugin.json 的 name 保持一致） */
export const LEAD_PARSER_PLUGIN = 'lead-parser'

/** 视图扩展 Provider 的唯一标识 */
export const LEAD_PARSER_PROVIDER_KEY = 'lead-parser'

/** Agent 工作台主视图 KEY */
export const LEAD_PARSER_WORKBENCH_VIEW_KEY = 'lead-parser-workbench'

/** Agent 中间件（大模型工具组）名称 */
export const LEAD_PARSER_MIDDLEWARE_NAME = 'lead-parser'

/** 工具名：解析线索文本 */
export const PARSE_LEAD_TOOL_NAME = 'lead_parser_parse'

/** 特性开关：视图 activation.requiredFeatures 使用 */
export const LEAD_PARSER_FEATURE = 'lead-parser'

/** 远程组件入口 KEY（对应 remote-components/ 下的目录名） */
export const LEAD_PARSER_REMOTE_ENTRY_KEY = 'lead-parser-workbench'

/** Agent 工作台插槽 */
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

/** 视图动作 KEY */
export const LEAD_PARSER_ACTION_PARSE = 'parse'
export const LEAD_PARSER_ACTION_SAVE = 'save'
