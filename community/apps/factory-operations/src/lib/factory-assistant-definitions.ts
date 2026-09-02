import {
  AGENT_KEYS,
  FACTORY_FEATURE,
  FACTORY_MIDDLEWARE,
  FACTORY_ROLE_TEMPLATE_KEYS
} from './constants.js'

export interface FactoryRoleAssistantDefinition {
  roleKey: string
  laneKey: string
  key: string
  title: string
  description: string
  avatar: {
    emoji: { id: string; unified: string }
    background: string
  }
  agentKey: string
  agentName: string
  middleware: Array<{
    key: string
    provider: string
    feature: string
    title: string
  }>
  startPrompts: readonly string[]
  prompt: string
  order: number
  writeAuthority: boolean
}

const sharedTaskContract = `
Correctness-critical inputs are supplied as structured parameters:
- caseId: {{caseId}}
- baseRevision: {{baseRevision}}
- operationId: {{operationId}}
- caseContext: {{caseContext}}
- task: {{input}}

Treat caseContext as a bounded persisted Factory Case projection. Never invent
sensor values, confirmations, revisions, or external-system results. Use only
your directly connected middleware, call each authorized mutation at most once,
and return its compact persisted receipt. If a prerequisite is missing, return
the exact blocker without attempting another role's work.`

export const FACTORY_ROLE_ASSISTANTS: readonly FactoryRoleAssistantDefinition[] = [
  {
    roleKey: 'anomaly-triage-specialist',
    laneKey: 'event-intake',
    key: FACTORY_ROLE_TEMPLATE_KEYS.triage,
    title: '工厂异常研判助手',
    description: '独立研判生产异常的真实性、严重度与证据完整性。',
    avatar: { emoji: { id: 'rotating_light', unified: '1f6a8' }, background: 'rgb(254, 242, 242)' },
    agentKey: AGENT_KEYS.triage,
    agentName: 'factory-anomaly-triage',
    middleware: [{
      key: 'Middleware_FactoryTriage',
      provider: FACTORY_MIDDLEWARE.triage,
      feature: FACTORY_FEATURE.triage,
      title: 'Anomaly triage tools'
    }],
    startPrompts: [
      '请基于当前 Factory Case 的持久化证据完成异常研判。',
      '请说明严重度结论、证据来源和仍缺失的前置条件。'
    ],
    prompt: `${sharedTaskContract}\n\nRead analysisFacts.triage and call factory_event_triage_record exactly once with at least two concrete evidence records.`,
    order: 30,
    writeAuthority: true
  },
  {
    roleKey: 'equipment-diagnostics-specialist',
    laneKey: 'equipment-engineering',
    key: FACTORY_ROLE_TEMPLATE_KEYS.equipment,
    title: '设备故障诊断助手',
    description: '独立研判设备失效模式、安全运行边界与维修建议。',
    avatar: { emoji: { id: 'wrench', unified: '1f527' }, background: 'rgb(239, 246, 255)' },
    agentKey: AGENT_KEYS.equipment,
    agentName: 'factory-equipment-diagnostics',
    middleware: [{
      key: 'Middleware_FactoryEquipment',
      provider: FACTORY_MIDDLEWARE.equipment,
      feature: FACTORY_FEATURE.equipment,
      title: 'Equipment diagnostic tools'
    }],
    startPrompts: [
      '请诊断当前 Factory Case 的设备失效模式与安全边界。',
      '请核对 CMMS 与遥测证据后给出维修建议。'
    ],
    prompt: `${sharedTaskContract}\n\nRead analysisFacts.equipment and call factory_equipment_diagnosis_record exactly once. Never imply that a stop command was executed.`,
    order: 31,
    writeAuthority: true
  },
  {
    roleKey: 'quality-risk-specialist',
    laneKey: 'quality-management',
    key: FACTORY_ROLE_TEMPLATE_KEYS.quality,
    title: '质量风险评估助手',
    description: '独立评估质量隔离范围、复检策略与放行风险。',
    avatar: { emoji: { id: 'shield', unified: '1f6e1-fe0f' }, background: 'rgb(245, 243, 255)' },
    agentKey: AGENT_KEYS.quality,
    agentName: 'factory-quality-risk',
    middleware: [{
      key: 'Middleware_FactoryQuality',
      provider: FACTORY_MIDDLEWARE.quality,
      feature: FACTORY_FEATURE.quality,
      title: 'Quality impact tools'
    }],
    startPrompts: [
      '请评估当前异常需要隔离的产品范围与复检策略。',
      '请基于 QMS 证据说明质量风险与置信度。'
    ],
    prompt: `${sharedTaskContract}\n\nRead analysisFacts.quality and call factory_quality_impact_record exactly once. Never release product or fabricate a QMS result.`,
    order: 32,
    writeAuthority: true
  },
  {
    roleKey: 'production-impact-specialist',
    laneKey: 'production-planning',
    key: FACTORY_ROLE_TEMPLATE_KEYS.production,
    title: '生产影响分析助手',
    description: '独立评估工单、交付、替代产线和增量成本影响。',
    avatar: { emoji: { id: 'calendar', unified: '1f4c6' }, background: 'rgb(255, 247, 237)' },
    agentKey: AGENT_KEYS.production,
    agentName: 'factory-production-impact',
    middleware: [{
      key: 'Middleware_FactoryProduction',
      provider: FACTORY_MIDDLEWARE.production,
      feature: FACTORY_FEATURE.production,
      title: 'Production impact tools'
    }],
    startPrompts: [
      '请评估当前异常对工单、交付和替代产线的影响。',
      '请核对 MES 与 APS 事实并记录生产影响。'
    ],
    prompt: `${sharedTaskContract}\n\nRead analysisFacts.production and call factory_production_impact_record exactly once. Do not reschedule work by prose.`,
    order: 33,
    writeAuthority: true
  },
  {
    roleKey: 'resource-readiness-specialist',
    laneKey: 'maintenance-and-logistics',
    key: FACTORY_ROLE_TEMPLATE_KEYS.resources,
    title: '维修资源就绪助手',
    description: '独立核验备件库存、运输时效与维修人员资质。',
    avatar: { emoji: { id: 'package', unified: '1f4e6' }, background: 'rgb(240, 253, 250)' },
    agentKey: AGENT_KEYS.resources,
    agentName: 'factory-resource-readiness',
    middleware: [{
      key: 'Middleware_FactoryResources',
      provider: FACTORY_MIDDLEWARE.resources,
      feature: FACTORY_FEATURE.resources,
      title: 'Resource readiness tools'
    }],
    startPrompts: [
      '请核验当前恢复任务的备件、运输与人员资质。',
      '请基于 WMS 与 CMMS 事实记录资源就绪结论。'
    ],
    prompt: `${sharedTaskContract}\n\nRead analysisFacts.resources and call factory_resource_readiness_record exactly once. Never reserve stock or dispatch personnel.`,
    order: 34,
    writeAuthority: true
  },
  {
    roleKey: 'recovery-planning-specialist',
    laneKey: 'recovery-planning',
    key: FACTORY_ROLE_TEMPLATE_KEYS.planning,
    title: '恢复方案规划助手',
    description: '独立汇总四域结论并生成可比较、可审批的恢复方案。',
    avatar: { emoji: { id: 'compass', unified: '1f9ed' }, background: 'rgb(236, 253, 245)' },
    agentKey: AGENT_KEYS.planning,
    agentName: 'factory-recovery-planning',
    middleware: [{
      key: 'Middleware_FactoryPlanning',
      provider: FACTORY_MIDDLEWARE.planning,
      feature: FACTORY_FEATURE.planning,
      title: 'Recovery planning tools'
    }],
    startPrompts: [
      '请检查四域结论是否齐备并生成恢复方案。',
      '请比较方案 A/B/C，并明确哪些决定必须由人审批。'
    ],
    prompt: `${sharedTaskContract}\n\nRequire all four persisted findings, then call factory_recovery_plan_generate exactly once. The result is a proposal, never an approval or execution confirmation.`,
    order: 35,
    writeAuthority: true
  },
  {
    roleKey: 'operations-approval-advisor',
    laneKey: 'operations-approval',
    key: FACTORY_ROLE_TEMPLATE_KEYS.approval,
    title: '生产运营审批顾问',
    description: '独立整理审批依据与执行状态，但不代替授权人员作出决定。',
    avatar: { emoji: { id: 'construction_worker', unified: '1f477' }, background: 'rgb(255, 251, 235)' },
    agentKey: AGENT_KEYS.approval,
    agentName: 'factory-operations-approval-advisor',
    middleware: [
      {
        key: 'Middleware_FactoryCoordination',
        provider: FACTORY_MIDDLEWARE.coordination,
        feature: FACTORY_FEATURE.coordination,
        title: 'Factory Case read tools'
      },
      {
        key: 'Middleware_FactoryExecution',
        provider: FACTORY_MIDDLEWARE.execution,
        feature: FACTORY_FEATURE.execution,
        title: 'Recovery execution status'
      }
    ],
    startPrompts: [
      '请整理当前恢复方案的审批依据、风险与修订号。',
      '请检查执行确认是否完整，并列出需要授权人员处理的事项。'
    ],
    prompt: `${sharedTaskContract}\n\nYou are read-only. Use factory_case_get_summary and factory_execution_status_get to explain the revision-bound decision and confirmation state. Never approve, reject, execute, or simulate a human decision.`,
    order: 36,
    writeAuthority: false
  },
  {
    roleKey: 'recovery-verification-specialist',
    laneKey: 'recovery-validation',
    key: FACTORY_ROLE_TEMPLATE_KEYS.verification,
    title: '生产恢复验证助手',
    description: '独立核验执行确认、设备状态、质量与生产恢复证据。',
    avatar: { emoji: { id: 'white_check_mark', unified: '2705' }, background: 'rgb(240, 253, 244)' },
    agentKey: AGENT_KEYS.verification,
    agentName: 'factory-recovery-verification',
    middleware: [{
      key: 'Middleware_FactoryVerification',
      provider: FACTORY_MIDDLEWARE.verification,
      feature: FACTORY_FEATURE.verification,
      title: 'Recovery verification tools'
    }],
    startPrompts: [
      '请核验当前事件的执行确认与恢复证据。',
      '请判断设备、质量和生产恢复条件是否全部满足。'
    ],
    prompt: `${sharedTaskContract}\n\nCall factory_recovery_verification_record exactly once only when every required recovery action has a persisted confirmation. Never infer completion from a plan alone.`,
    order: 37,
    writeAuthority: true
  }
] as const

export function roleAssistantByTemplateKey(templateKey: string) {
  return FACTORY_ROLE_ASSISTANTS.find((definition) => definition.key === templateKey)
}
