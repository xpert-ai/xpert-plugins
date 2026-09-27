export const RESUME_SCREEN_PLUGIN_NAME = '@xpert-ai/plugin-resume-screen'
export const RESUME_SCREEN_PROVIDER_KEY = 'resume_screen'
export const RESUME_SCREEN_FEATURE = 'resume_screen'
export const RESUME_SCREEN_WORKBENCH_VIEW_KEY = 'workbench'
export const RESUME_SCREEN_PUBLIC_VIEW_KEY = `${RESUME_SCREEN_PROVIDER_KEY}__${RESUME_SCREEN_WORKBENCH_VIEW_KEY}`
export const RESUME_SCREEN_REMOTE_ENTRY_KEY = 'resume-screen'
export const RESUME_SCREEN_MIDDLEWARE_NAME = 'ResumeScreenMiddleware'
export const RESUME_SCREEN_TEMPLATE_PROVIDER_KEY = 'resumeScreenTemplates'
export const RESUME_SCREEN_ARTIFACT_NAMESPACE = 'resume_screen'

// 模型可调用的工具（推进/待定/淘汰/撤回/编辑刻意不提供）
export const RESUME_SCREEN_SAVE_TOOL_NAME = 'resume_screen_save_candidates'
export const RESUME_SCREEN_LIST_TOOL_NAME = 'resume_screen_list_candidates'
export const RESUME_SCREEN_DETAIL_TOOL_NAME = 'resume_screen_get_candidate_detail'
export const RESUME_SCREEN_MIDDLEWARE_TOOL_NAMES = [
  RESUME_SCREEN_SAVE_TOOL_NAME,
  RESUME_SCREEN_LIST_TOOL_NAME,
  RESUME_SCREEN_DETAIL_TOOL_NAME
] as const

export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
// 运行时用户对话只查询该 fixed 槽并据此开远程组件 tab（spec v2.4/蓝图 v4.3 槽位模型）
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

// 解析队列（链路 B）：queue/job 名与入队默认重试预算（attempts=4 含首次，backoff 指数 2s 起）
export const RESUME_SCREEN_PARSE_QUEUE = 'resume-screen.parse'
export const RESUME_SCREEN_PARSE_JOB = 'parse-candidate'
export const RESUME_SCREEN_PARSE_ATTEMPTS = 4
// sweep 单轮捞取上限：服务查询 take 与 worker 重投循环共用同一口径，防止兜底轮次挤占队列
export const RESUME_SCREEN_SWEEP_BATCH_LIMIT = 50

export const RESUME_SCREEN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="56" y="40" width="144" height="176" rx="16" fill="#FFFFFF" stroke="#1D4ED8" stroke-width="8"/>
  <circle cx="96" cy="96" r="20" fill="#DBEAFE" stroke="#1D4ED8" stroke-width="8"/>
  <path d="M76 148C76 132 84 124 96 124C108 124 116 132 116 148" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round"/>
  <path d="M132 88H180" stroke="#1D4ED8" stroke-width="10" stroke-linecap="round"/>
  <path d="M132 112H172" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M132 136H164" stroke="#94A3B8" stroke-width="8" stroke-linecap="round"/>
  <path d="M76 172H180" stroke="#93C5FD" stroke-width="8" stroke-linecap="round"/>
  <path d="M76 192H152" stroke="#93C5FD" stroke-width="8" stroke-linecap="round"/>
</svg>`
