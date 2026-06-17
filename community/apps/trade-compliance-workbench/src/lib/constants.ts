export const TRADE_COMPLIANCE_PLUGIN_NAME = '@chenchaolong/plugin-trade-compliance-workbench'
export const TRADE_COMPLIANCE_PROVIDER_KEY = 'trade_compliance_workbench'
export const TRADE_COMPLIANCE_VIEW_KEY = 'trade_compliance_workbench'
export const TRADE_COMPLIANCE_REMOTE_ENTRY_KEY = 'trade-compliance-workbench'
export const TRADE_COMPLIANCE_FEATURE = 'trade_compliance_workbench'
export const TRADE_COMPLIANCE_MIDDLEWARE_NAME = 'TradeComplianceWorkbenchMiddleware'
export const TRADE_COMPLIANCE_TEMPLATE_PROVIDER_KEY = 'tradeComplianceWorkbenchTemplates'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

export const TRADE_COMPLIANCE_TOOL_NAMES = [
  'trade_compliance_save_controlled_goods_extraction',
  'trade_compliance_save_supplier_contract_extraction',
  'trade_compliance_enrich_product',
  'trade_compliance_match_controlled_goods',
  'trade_compliance_save_sales_contract_extraction',
  'trade_compliance_prepare_customs_workbook',
  'trade_compliance_record_generated_workbook'
] as const

export const TRADE_COMPLIANCE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/><path d="m16 15 2 2 3-4"/></svg>'
