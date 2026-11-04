export const PLUGIN_NAME = '@xpert-ai/plugin-funds-query'
export const NAMESPACE = 'funds_query'
export const FEATURE = 'funds_query.analysis'
export const PROVIDER = 'funds_query.views'
export const VIEW = 'funds_query.workbench'
export const ENTRY = 'funds-query'
export const MIDDLEWARE = 'FundsQueryMiddleware'
export const TEMPLATE = 'funds-query-assistant'
export const CONFIG = Symbol('funds_query.runtime_config')
export const ICON = {
  type: 'svg',
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4h16v16H4zM8 15v2m4-6v6m4-10v10M4 8h16"/></svg>'
} as const
