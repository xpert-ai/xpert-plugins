export const SCRAPE_TASK_INTAKE_PLUGIN_NAME = '@xpert-ai/plugin-scrape-task-intake'
export const SCRAPE_TASK_INTAKE_ARTIFACT_NAMESPACE = 'scrape_task_intake'
export const SCRAPE_TASK_INTAKE_PROVIDER_KEY = 'scrape_task_intake'
export const SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY = 'workbench'
export const SCRAPE_TASK_INTAKE_REPORT_VIEW_KEY = 'report_entry'
export const SCRAPE_TASK_INTAKE_REVIEW_VIEW_KEY = 'review_desk'
export const SCRAPE_TASK_INTAKE_WORKBENCH_PUBLIC_VIEW_KEY = `${SCRAPE_TASK_INTAKE_PROVIDER_KEY}__${SCRAPE_TASK_INTAKE_WORKBENCH_VIEW_KEY}`
export const SCRAPE_TASK_INTAKE_REPORT_PUBLIC_VIEW_KEY = `${SCRAPE_TASK_INTAKE_PROVIDER_KEY}__${SCRAPE_TASK_INTAKE_REPORT_VIEW_KEY}`
export const SCRAPE_TASK_INTAKE_REVIEW_PUBLIC_VIEW_KEY = `${SCRAPE_TASK_INTAKE_PROVIDER_KEY}__${SCRAPE_TASK_INTAKE_REVIEW_VIEW_KEY}`
export const SCRAPE_TASK_INTAKE_REMOTE_ENTRY_KEY = 'scrape-task-intake'
export const SCRAPE_TASK_INTAKE_FEATURE = 'scrape_task_intake'
export const SCRAPE_TASK_INTAKE_MIDDLEWARE_NAME = 'ScrapeTaskIntakeMiddleware'
export const SCRAPE_TASK_INTAKE_TEMPLATE_PROVIDER_KEY = 'scrapeTaskIntakeTemplates'
export const SCRAPE_TASK_INTAKE_GET_CATALOG_TOOL_NAME = 'scrape_intake_get_catalog'
export const SCRAPE_TASK_INTAKE_SAVE_TOOL_NAME = 'scrape_intake_save_generated_task'
export const SCRAPE_TASK_INTAKE_SEARCH_TOOL_NAME = 'scrape_intake_search_tasks'
export const SCRAPE_TASK_INTAKE_DETAIL_TOOL_NAME = 'scrape_intake_get_task_detail'
export const SCRAPE_TASK_INTAKE_SUPPLEMENT_DRAFT_TOOL_NAME = 'scrape_intake_prepare_supplement_draft'
export const SCRAPE_TASK_INTAKE_MIDDLEWARE_TOOL_NAMES = [
  SCRAPE_TASK_INTAKE_GET_CATALOG_TOOL_NAME,
  SCRAPE_TASK_INTAKE_SAVE_TOOL_NAME,
  SCRAPE_TASK_INTAKE_SEARCH_TOOL_NAME,
  SCRAPE_TASK_INTAKE_DETAIL_TOOL_NAME,
  SCRAPE_TASK_INTAKE_SUPPLEMENT_DRAFT_TOOL_NAME
] as const
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const SCRAPE_TASK_INTAKE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect width="256" height="256" rx="36" fill="transparent"/>
  <rect x="52" y="42" width="152" height="172" rx="18" fill="#FFFFFF" stroke="#0F766E" stroke-width="8"/>
  <circle cx="104" cy="92" r="16" fill="#CCFBF1" stroke="#0F766E" stroke-width="7"/>
  <path d="M74 92H86" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <path d="M122 92H158" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <circle cx="104" cy="140" r="16" fill="#CCFBF1" stroke="#0F766E" stroke-width="7"/>
  <path d="M74 140H86" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <path d="M122 140H158" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <circle cx="104" cy="188" r="16" fill="#CCFBF1" stroke="#0F766E" stroke-width="7"/>
  <path d="M74 188H86" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <path d="M122 188H148" stroke="#0F766E" stroke-width="6" stroke-linecap="round"/>
  <path d="M172 88L196 112" stroke="#14B8A6" stroke-width="10" stroke-linecap="round"/>
  <path d="M172 168L196 144" stroke="#14B8A6" stroke-width="10" stroke-linecap="round"/>
</svg>`
