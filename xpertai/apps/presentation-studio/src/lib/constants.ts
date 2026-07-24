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
export const PRESENTATION_SANDBOX_ACTION_VERSION = '1.0.2'
export const PRESENTATION_SANDBOX_JOB_TIMEOUT_MS = 600_000
export const DASHIAI_UPSTREAM_COMMIT = '69ac66443e36e11cfca4a7f30721dc71a4278d28'
export const DASHIAI_LAYOUT_COUNT = 1188
export const DASHIAI_CONTROL_COUNT = 9942
export const PRESENTATION_THEME_PACKS = [
  'theme01', 'theme02', 'theme03', 'theme04', 'theme05', 'theme06',
  'theme07', 'theme08', 'theme09', 'theme10', 'theme11', 'theme12',
  'theme13', 'theme14'
] as const
export const PRESENTATION_THEME_CATALOG = {
  theme01: { displayName: '轻拟态风', scenario: '产品介绍、企业汇报、方案说明、轻量级发布' },
  theme02: { displayName: '炫光紫绿风', scenario: '科技发布会、AI/自动驾驶/机器人主题、增长故事、创新项目展示' },
  theme03: { displayName: '深浅代码风', scenario: '技术方案、开发者大会、系统架构、AI 工程实践' },
  theme04: { displayName: '玻璃糖果风', scenario: '年轻化品牌、消费产品、创意提案、社媒感内容' },
  theme05: { displayName: '色谱图表风', scenario: '数据报告、市场分析、KPI 复盘、行业研究' },
  theme06: { displayName: '深色图谱风', scenario: '高密度数据展示、战略分析、科技/金融/产业报告' },
  theme07: { displayName: '冷白调研风', scenario: '调研报告、白皮书、竞品分析、学术/政策型表达' },
  theme08: { displayName: '黑金实验风', scenario: '高端发布、品牌提案、实验性概念、奢华科技叙事' },
  theme09: { displayName: '深蓝杂志风', scenario: '品牌故事、人物访谈、企业形象册、深度专题' },
  theme10: { displayName: '金色指数风', scenario: '金融数据、投资报告、商业指数、年度榜单' },
  theme11: { displayName: '高能增长风', scenario: '增长复盘、商业计划、融资路演、市场扩张方案' },
  theme12: { displayName: '声波霓虹风', scenario: '音乐娱乐、潮流活动、直播内容、年轻化发布' },
  theme13: { displayName: '深蓝光环风', scenario: '科技汇报、产品发布、技术复盘' },
  theme14: { displayName: '紫橙怪趣风', scenario: '节日活动、创意课堂、娱乐故事' }
} as const satisfies Record<(typeof PRESENTATION_THEME_PACKS)[number], {
  displayName: string
  scenario: string
}>
export const PRESENTATION_STATUSES = ['draft', 'reviewed', 'archived', 'failed'] as const
export const PRESENTATION_SLIDE_STATUSES = ['active', 'skipped', 'deleted'] as const
export const PRESENTATION_EXPORT_KINDS = ['html', 'pdf', 'pptx'] as const
export const PRESENTATION_EXPORT_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const
export const PRESENTATION_VERSION_SOURCES = ['agent', 'workbench', 'collaboration', 'restore', 'system'] as const
export const PRESENTATION_TOOL_NAMES = [
  'presentation_create_deck',
  'presentation_list_theme_previews',
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
  'presentation_revoke_html_share',
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
  'presentation_revoke_html_share',
  'presentation_update_status'
] as const

export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const PROJECT_DETAIL_SECTIONS_SLOT = 'detail.sections'

export const PRESENTATION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Presentation Studio"><rect x="7" y="9" width="50" height="38" rx="7" fill="#7c3aed"/><rect x="14" y="16" width="22" height="5" rx="2.5" fill="#ede9fe"/><rect x="14" y="26" width="14" height="3" rx="1.5" fill="#c4b5fd"/><rect x="39" y="17" width="11" height="17" rx="3" fill="#a78bfa"/><path d="M32 47v8M23 55h18" stroke="#7c3aed" stroke-width="4" stroke-linecap="round"/></svg>`

export function presentationStudioTable(key: string) {
  return pluginArtifactTableName(PRESENTATION_STUDIO_ARTIFACT_NAMESPACE, key)
}
