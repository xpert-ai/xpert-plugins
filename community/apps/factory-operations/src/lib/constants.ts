import type { IconDefinition } from '@xpert-ai/contracts'

export const FACTORY_PLUGIN_NAME = '@xpert-ai/plugin-factory-operations'
export const FACTORY_PLUGIN_LEVEL = 'tenant' as const
export const FACTORY_ARTIFACT_NAMESPACE = 'factory_ops'
export const FACTORY_FLOW_TEMPLATE_KEY = 'factory_anomaly_recovery'
export const FACTORY_FLOW_TEMPLATE_VERSION = 3
export const FACTORY_VIEW_PROVIDER_KEY = 'factory_ops'
export const FACTORY_VIEW_KEY = 'factory-operations-center'
export const FACTORY_REMOTE_ENTRY_KEY = 'factory-operations-center'
export const FACTORY_CASE_WORKSPACE_VIEW_KEY = 'factory-case-workspace'
export const FACTORY_CASE_WORKSPACE_REMOTE_ENTRY_KEY = 'factory-case-workspace'
export const FACTORY_DASHBOARD_VIEW_KEY = 'factory-operations-dashboard'
export const FACTORY_DASHBOARD_REMOTE_ENTRY_KEY = 'factory-operations-dashboard'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const FACTORY_TEMPLATE_KEY = 'factory-operations-autopilot'
export const FACTORY_MANAGER_TEMPLATE_KEY = 'factory-operations-manager'
export const FACTORY_ASSISTANT_SUITE_KEY = 'factory-operations-independent-assistants-v4'
export const FACTORY_ASSISTANT_TASK_QUEUE = 'factory_ops.assistant-tasks'
export const FACTORY_ASSISTANT_TASK_JOB = 'dispatch'
export const FACTORY_TEMPLATE_PROVIDER_KEY = 'factoryOperationsTemplates'
export const FACTORY_WORKBENCH_FEATURE = 'factory-operations-workbench'
export const FACTORY_MANAGEMENT_DASHBOARD_FEATURE = 'factory-operations-management-dashboard'

export const FACTORY_MIDDLEWARE = {
  coordination: 'FactoryCaseCoordinationMiddleware',
  monitoring: 'FactoryOperationsMonitoringMiddleware',
  triage: 'FactoryEventTriageMiddleware',
  equipment: 'FactoryEquipmentDiagnosticsMiddleware',
  quality: 'FactoryQualityRiskMiddleware',
  production: 'FactoryProductionImpactMiddleware',
  resources: 'FactoryResourceReadinessMiddleware',
  planning: 'FactoryRecoveryPlanningMiddleware',
  execution: 'FactoryRecoveryExecutionMiddleware',
  verification: 'FactoryRecoveryVerificationMiddleware'
} as const

export const FACTORY_FEATURE = {
  coordination: 'factory-case-coordination',
  monitoring: 'factory-operations-monitoring',
  triage: 'factory-event-triage',
  equipment: 'factory-equipment-diagnostics',
  quality: 'factory-quality-risk',
  production: 'factory-production-impact',
  resources: 'factory-resource-readiness',
  planning: 'factory-recovery-planning',
  execution: 'factory-recovery-execution',
  verification: 'factory-recovery-validation'
} as const

export const FACTORY_TOOL = {
  caseSummary: 'factory_case_get_summary',
  caseProgress: 'factory_case_get_progress',
  dashboard: 'factory_operations_dashboard_get',
  triage: 'factory_event_triage_record',
  equipment: 'factory_equipment_diagnosis_record',
  quality: 'factory_quality_impact_record',
  production: 'factory_production_impact_record',
  resources: 'factory_resource_readiness_record',
  plan: 'factory_recovery_plan_generate',
  execution: 'factory_execution_status_get',
  verification: 'factory_recovery_verification_record'
} as const

export const FACTORY_MUTATION_TOOL_NAMES = [
  FACTORY_TOOL.triage,
  FACTORY_TOOL.equipment,
  FACTORY_TOOL.quality,
  FACTORY_TOOL.production,
  FACTORY_TOOL.resources,
  FACTORY_TOOL.plan,
  FACTORY_TOOL.verification
] as const

export const FACTORY_ICON_SVG = `
<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="24" y="24" width="208" height="208" rx="40" fill="#E7F8F1"/>
  <path d="M58 184V94l44 24V92l44 24V72h34v112H58Z" fill="#0F766E"/>
  <path d="M78 145h20v18H78zm40 0h20v18h-20zm40 0h20v18h-20z" fill="#ECFDF5"/>
  <circle cx="184" cy="72" r="30" fill="#FEF3C7" stroke="#D97706" stroke-width="12"/>
  <path d="M184 55v20m0 12v2" stroke="#92400E" stroke-width="10" stroke-linecap="round"/>
</svg>`

export const FACTORY_ICON: IconDefinition = {
  type: 'svg',
  value: FACTORY_ICON_SVG,
  alt: 'Factory operations center'
}

export const AGENT_KEYS = {
  coordinator: 'Agent_FactoryCoordinator',
  triage: 'Agent_AnomalyTriage',
  equipment: 'Agent_EquipmentDiagnostics',
  quality: 'Agent_QualityImpact',
  production: 'Agent_ProductionImpact',
  resources: 'Agent_ResourceReadiness',
  planning: 'Agent_RecoveryPlanning',
  approval: 'Agent_OperationsApprovalAdvisor',
  verification: 'Agent_RecoveryVerification',
  manager: 'Agent_FactoryOperationsManager'
} as const

export const FACTORY_ROLE_TEMPLATE_KEYS = {
  triage: 'factory-anomaly-triage-assistant',
  equipment: 'factory-equipment-diagnostics-assistant',
  quality: 'factory-quality-risk-assistant',
  production: 'factory-production-impact-assistant',
  resources: 'factory-resource-readiness-assistant',
  planning: 'factory-recovery-planning-assistant',
  approval: 'factory-operations-approval-advisor',
  verification: 'factory-recovery-verification-assistant'
} as const
