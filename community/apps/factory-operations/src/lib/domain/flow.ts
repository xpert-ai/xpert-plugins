import {
  BadRequestException,
  ConflictException
} from '@nestjs/common'
import type {
  EquipmentFinding,
  EvidenceRecord,
  FactoryCaseState,
  FactoryCaseSummary,
  FactoryAnalysisFacts,
  FactoryFindingKind,
  FactoryTimelineEvent,
  ProductionFinding,
  QualityFinding,
  RecoveryAction,
  ResourceFinding,
  TriageAssessment
} from './types.js'

export interface TriageCommand {
  type: 'triage'
  agentKey: string
  at: string
  severity: TriageAssessment['severity']
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
}

export interface EquipmentCommand {
  type: 'finding'
  kind: 'equipment'
  agentKey: string
  at: string
  failureMode: string
  remainingSafeMinutes: number
  recommendation: EquipmentFinding['recommendation']
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
}

export interface QualityCommand {
  type: 'finding'
  kind: 'quality'
  agentKey: string
  at: string
  affectedQuantity: number
  isolationWindowMinutes: number
  recommendation: QualityFinding['recommendation']
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
}

export interface ProductionCommand {
  type: 'finding'
  kind: 'production'
  agentKey: string
  at: string
  impactedWorkOrderCount: number
  riskOrderCount: number
  estimatedDelayMinutes: number
  alternateLineId: string | null
  changeoverMinutes: number
  incrementalCostCny: number
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
}

export interface ResourceCommand {
  type: 'finding'
  kind: 'resources'
  agentKey: string
  at: string
  spareSku: string
  spareAvailability: ResourceFinding['spareAvailability']
  spareQuantity: number
  deliveryMinutes: number
  qualifiedEngineerAvailable: boolean
  summary: string
  confidence: number
  evidence: EvidenceRecord[]
}

export interface GeneratePlanCommand {
  type: 'generate_plan'
  agentKey: string
  at: string
}

export interface ApprovePlanCommand {
  type: 'approve_plan'
  actorId: string
  at: string
  reason: string
}

export interface RejectPlanCommand {
  type: 'reject_plan'
  actorId: string
  at: string
  reason: string
}

export interface ExecutePlanCommand {
  type: 'execute_plan'
  at: string
  mode: 'simulation' | 'external'
}

export interface VerifyRecoveryCommand {
  type: 'verify_recovery'
  agentKey: string
  at: string
}

export type FactoryCommand =
  | TriageCommand
  | EquipmentCommand
  | QualityCommand
  | ProductionCommand
  | ResourceCommand
  | GeneratePlanCommand
  | ApprovePlanCommand
  | RejectPlanCommand
  | ExecutePlanCommand
  | VerifyRecoveryCommand

export interface ArtifactProjection {
  key: string
  revision: number
  status: string
  payload: object
  evidence: EvidenceRecord[]
  confidence: number | null
  agentKey: string | null
}

export function createDemoFactoryCase(
  id: string,
  caseKey: string,
  occurredAt: string
): FactoryCaseState {
  return {
    id,
    caseKey,
    templateKey: 'factory_anomaly_recovery',
    templateVersion: 3,
    revision: 1,
    status: 'investigating',
    currentStage: 'triage-event',
    event: {
      eventId: `EVT-${caseKey}`,
      deviceId: 'M-07',
      deviceName: '磨削中心 M-07',
      lineId: 'A',
      category: 'equipment_failure',
      severity: 'critical',
      status: 'open',
      occurredAt,
      title: '主轴振动趋势异常',
      summary: '主轴振动与轴承温度持续上升，加工尺寸接近质量控制边界。',
      telemetry: {
        vibrationMmS: 8.7,
        bearingTemperatureC: 86.4,
        dimensionTrend: 'approaching_limit'
      },
      impactedWorkOrders: ['WO-260831-017', 'WO-260831-021', 'WO-260831-024'],
      impactedProductQuantity: 126,
      riskOrderCount: 2
    },
    analysisFacts: createDemoAnalysisFacts(occurredAt),
    triage: null,
    findings: {
      equipment: null,
      quality: null,
      production: null,
      resources: null
    },
    plan: null,
    execution: null,
    verification: null,
    timeline: [
      timeline('anomaly-detected', occurredAt, '检测到 M-07 严重设备异常', 'IoT 规则引擎')
    ],
    metrics: {
      responseSeconds: null,
      recoveryMinutes: null,
      avoidedDowntimeMinutes: 0,
      avoidedLossCny: 0
    }
  }
}

export function applyFactoryCommand(
  current: FactoryCaseState,
  command: FactoryCommand
): FactoryCaseState {
  const state = structuredClone(current)
  const nextRevision = current.revision + 1

  switch (command.type) {
    case 'triage': {
      if (state.triage) conflict('factory_triage_exists', 'Triage is already recorded.')
      state.triage = {
        artifactRevision: 1,
        status: 'confirmed',
        severity: command.severity,
        summary: command.summary,
        confidence: command.confidence,
        evidence: command.evidence,
        agentKey: command.agentKey
      }
      state.currentStage = 'parallel-specialist-analysis'
      state.metrics.responseSeconds = secondsBetween(state.event.occurredAt, command.at)
      state.timeline.push(
        timeline('triage-completed', command.at, '异常真实性与影响范围已确认', '异常研判 Agent')
      )
      break
    }
    case 'finding': {
      requireTriage(state)
      if (state.findings[command.kind]) {
        conflict(
          'factory_finding_exists',
          `${command.kind} finding is already recorded.`
        )
      }
      applyFinding(state, command)
      state.currentStage = allFindingsComplete(state)
        ? 'generate-recovery-plan'
        : 'parallel-specialist-analysis'
      state.timeline.push(
        timeline(
          `${command.kind}-analysis-completed`,
          command.at,
          findingTitle(command.kind),
          command.agentKey
        )
      )
      break
    }
    case 'generate_plan': {
      if (!allFindingsComplete(state)) {
        invalid('factory_findings_incomplete', 'All specialist findings are required.')
      }
      if (state.plan) conflict('factory_plan_exists', 'Recovery plan already exists.')
      const production = requiredFinding(state.findings.production, 'production')
      state.plan = {
        artifactRevision: 1,
        status: 'proposed',
        options: [
          {
            id: 'A',
            title: '原地停机维修',
            description: '暂停 M-07 并等待维修完成后恢复原工单。',
            deliveryDelayMinutes: production.estimatedDelayMinutes,
            incrementalCostCny: 0,
            safetyRisk: 'low',
            qualityRisk: 'low',
            recommended: false,
            rationale: '成本最低，但当天紧急订单将延期。'
          },
          {
            id: 'B',
            title: '停机维修并切换 B 线',
            description: '停机维修 M-07，同时将两张紧急工单切换至 B 线并执行首件确认。',
            deliveryDelayMinutes: 0,
            incrementalCostCny: production.incrementalCostCny,
            safetyRisk: 'low',
            qualityRisk: 'low',
            recommended: true,
            rationale: '在保障设备与质量安全的前提下避免订单延期，综合损失最低。'
          },
          {
            id: 'C',
            title: '继续运行后维修',
            description: '继续运行至紧急工单完成，再停机维修。',
            deliveryDelayMinutes: 0,
            incrementalCostCny: 600,
            safetyRisk: 'unacceptable',
            qualityRisk: 'unacceptable',
            recommended: false,
            rationale: '设备损伤与产品质量风险不可接受。'
          }
        ],
        recommendedOptionId: 'B',
        selectedOptionId: null,
        executionAuthority: 'approval-required',
        rationale: '方案 B 同时满足安全、质量和当天交付约束。',
        approval: {
          status: 'pending',
          actorId: null,
          reason: null,
          decidedAt: null,
          caseRevision: null
        }
      }
      state.status = 'awaiting_approval'
      state.currentStage = 'approve-recovery-plan'
      state.timeline.push(
        timeline('plan-generated', command.at, '三套恢复方案已生成，推荐方案 B', command.agentKey)
      )
      break
    }
    case 'approve_plan': {
      const plan = requirePendingPlan(state)
      plan.artifactRevision += 1
      plan.status = 'approved'
      plan.selectedOptionId = 'B'
      plan.approval = {
        status: 'approved',
        actorId: command.actorId,
        reason: command.reason,
        decidedAt: command.at,
        caseRevision: nextRevision
      }
      state.status = 'approved'
      state.currentStage = 'execute-recovery-plan'
      state.timeline.push(
        timeline('plan-approved', command.at, '生产运营负责人批准方案 B', command.actorId)
      )
      break
    }
    case 'reject_plan': {
      const plan = requirePendingPlan(state)
      plan.artifactRevision += 1
      plan.status = 'rejected'
      plan.approval = {
        status: 'rejected',
        actorId: command.actorId,
        reason: command.reason,
        decidedAt: command.at,
        caseRevision: nextRevision
      }
      state.status = 'rejected'
      state.currentStage = 'human-intervention-required'
      state.timeline.push(
        timeline('plan-rejected', command.at, '恢复方案被拒绝，转人工处置', command.actorId, 'failed')
      )
      break
    }
    case 'execute_plan': {
      const plan = state.plan
      if (!plan || plan.status !== 'approved' || plan.selectedOptionId !== 'B') {
        invalid('factory_plan_not_approved', 'An approved plan B is required.')
      }
      if (state.execution) conflict('factory_execution_exists', 'Plan is already executed.')
      if (command.mode === 'external') {
        invalid(
          'factory_external_adapters_unconfigured',
          'External mode requires configured MES, CMMS, WMS, APS, and QMS adapters.'
        )
      }
      const actions = simulatedActions(command.at)
      state.execution = {
        artifactRevision: 1,
        status: actions.every((action) => action.status === 'confirmed')
          ? 'completed'
          : 'partial_failure',
        mode: command.mode,
        startedAt: command.at,
        completedAt: addMinutes(command.at, 38),
        actions
      }
      state.status = 'verifying'
      state.currentStage =
        state.execution.status === 'completed'
          ? 'verify-recovery'
          : 'human-intervention-required'
      state.timeline.push(
        timeline('execution-completed', state.execution.completedAt, '12 项恢复动作获得模拟系统确认', 'Factory simulator')
      )
      break
    }
    case 'verify_recovery': {
      if (!state.execution || state.execution.status !== 'completed') {
        invalid('factory_execution_incomplete', 'Completed execution is required.')
      }
      if (state.verification) {
        conflict('factory_verification_exists', 'Recovery is already verified.')
      }
      const recoveryEvidence: EvidenceRecord[] = [
        evidence('iot', 'telemetry:M-07:vibration', command.at, '主轴振动恢复至 2.1 mm/s', 2.1, 'mm/s'),
        evidence('qms', 'inspection:first-article:B-line', command.at, 'B 线首件检验通过'),
        evidence('mes', 'work-order:SO-260831-07', command.at, '紧急订单已恢复生产且预计按时完成')
      ]
      state.verification = {
        artifactRevision: 1,
        status: 'completed',
        outcome: 'recovered',
        verifiedAt: command.at,
        summary: '设备、首件质量和紧急订单三项恢复条件均已满足。',
        evidence: recoveryEvidence,
        confidence: 0.98,
        agentKey: command.agentKey
      }
      state.event.status = 'closed'
      state.status = 'recovered'
      state.currentStage = 'production-recovered'
      state.metrics.recoveryMinutes = Math.max(
        1,
        Math.round(secondsBetween(state.event.occurredAt, command.at) / 60)
      )
      state.metrics.avoidedDowntimeMinutes = 210
      state.metrics.avoidedLossCny = 186000
      state.timeline.push(
        timeline('recovery-verified', command.at, '生产恢复条件验证通过，事件关闭', command.agentKey)
      )
      break
    }
  }

  state.revision = nextRevision
  return state
}

export function projectFactoryCase(
  state: FactoryCaseState,
  workspace: FactoryCaseSummary['workspace']
): FactoryCaseSummary {
  const completedSteps = completedStepCount(state)
  return {
    id: state.id,
    caseKey: state.caseKey,
    title: `${state.event.deviceName} · ${state.event.title}`,
    templateKey: state.templateKey,
    templateVersion: state.templateVersion,
    revision: state.revision,
    status: state.status,
    currentStage: state.currentStage,
    workspace,
    event: state.event,
    analysisFacts: state.analysisFacts,
    triage: state.triage,
    findings: state.findings,
    plan: state.plan,
    execution: state.execution,
    verification: state.verification,
    timeline: state.timeline,
    metrics: state.metrics,
    progress: {
      completedSteps,
      totalSteps: 10,
      percent: completedSteps * 10
    },
    nextAction: nextAction(state),
    allowedActions: allowedActions(state)
  }
}

export function createDemoAnalysisFacts(observedAt: string): FactoryAnalysisFacts {
  return {
    triage: {
      severity: 'critical',
      summary: 'IoT 趋势与质量边界规则共同确认异常有效，启动四个专业域并行研判。',
      confidence: 0.99,
      evidence: [
        evidence('iot', 'telemetry:M-07:vibration', observedAt, '主轴振动升至 8.7 mm/s', 8.7, 'mm/s'),
        evidence('rule', 'rule:grinder-bearing-critical-v3', observedAt, '振动与温度组合规则达到严重阈值')
      ]
    },
    equipment: {
      failureMode: '主轴轴承早期失效',
      remainingSafeMinutes: 0,
      recommendation: 'stop_immediately',
      summary: '建议立即停止 M-07，预计维修 2 小时，继续运行可能扩大设备损伤。',
      confidence: 0.96,
      evidence: [
        evidence('cmms', 'history:M-07:spindle-bearing', observedAt, '相似振动谱与历史轴承故障模式匹配')
      ]
    },
    quality: {
      affectedQuantity: 126,
      isolationWindowMinutes: 90,
      recommendation: 'isolate_and_reinspect',
      summary: '隔离最近 90 分钟生产的 126 件产品，并执行追加尺寸与圆度检测。',
      confidence: 0.95,
      evidence: [
        evidence('qms', 'spc:M-07:dimension', observedAt, '尺寸均值连续向控制上限漂移')
      ]
    },
    production: {
      impactedWorkOrderCount: 3,
      riskOrderCount: 2,
      estimatedDelayMinutes: 210,
      alternateLineId: 'B',
      changeoverMinutes: 45,
      incrementalCostCny: 1800,
      summary: '原地等待将使紧急订单延期 3.5 小时；B 线换装夹具后可承接两张急单。',
      confidence: 0.94,
      evidence: [
        evidence('aps', 'capacity:B-line:260831', observedAt, 'B 线具备替代工序能力和可用产能')
      ]
    },
    resources: {
      spareSku: 'BRG-M07-01',
      spareAvailability: 'available',
      spareQuantity: 1,
      deliveryMinutes: 18,
      qualifiedEngineerAvailable: true,
      summary: '本地库存有 1 件主轴轴承，18 分钟可送达，值班工程师具备对应资质。',
      confidence: 0.98,
      evidence: [
        evidence('wms', 'stock:BRG-M07-01', observedAt, '可用库存 1 件且未被其他任务锁定')
      ]
    }
  }
}

export function artifactForCommand(
  state: FactoryCaseState,
  command: FactoryCommand
): ArtifactProjection {
  switch (command.type) {
    case 'triage':
      return artifact('triage-assessment', required(state.triage), command.agentKey)
    case 'finding':
      return artifact(
        findingArtifactKey(command.kind),
        required(state.findings[command.kind]),
        command.agentKey
      )
    case 'generate_plan':
    case 'approve_plan':
    case 'reject_plan':
      return artifact('recovery-plan', required(state.plan), command.type === 'generate_plan' ? command.agentKey : null)
    case 'execute_plan':
      return artifact('execution-batch', required(state.execution), null)
    case 'verify_recovery':
      return artifact('recovery-verification', required(state.verification), command.agentKey)
  }
}

export function isSafeParallelFinding(
  state: FactoryCaseState,
  kind: FactoryFindingKind
) {
  return Boolean(state.triage && !state.findings[kind] && !state.plan)
}

function applyFinding(
  state: FactoryCaseState,
  command: EquipmentCommand | QualityCommand | ProductionCommand | ResourceCommand
) {
  const base = {
    artifactRevision: 1,
    status: 'completed' as const,
    summary: command.summary,
    confidence: command.confidence,
    evidence: command.evidence,
    agentKey: command.agentKey
  }
  if (command.kind === 'equipment') {
    state.findings.equipment = {
      ...base,
      failureMode: command.failureMode,
      remainingSafeMinutes: command.remainingSafeMinutes,
      recommendation: command.recommendation
    }
  } else if (command.kind === 'quality') {
    state.findings.quality = {
      ...base,
      affectedQuantity: command.affectedQuantity,
      isolationWindowMinutes: command.isolationWindowMinutes,
      recommendation: command.recommendation
    }
  } else if (command.kind === 'production') {
    state.findings.production = {
      ...base,
      impactedWorkOrderCount: command.impactedWorkOrderCount,
      riskOrderCount: command.riskOrderCount,
      estimatedDelayMinutes: command.estimatedDelayMinutes,
      alternateLineId: command.alternateLineId,
      changeoverMinutes: command.changeoverMinutes,
      incrementalCostCny: command.incrementalCostCny
    }
  } else {
    state.findings.resources = {
      ...base,
      spareSku: command.spareSku,
      spareAvailability: command.spareAvailability,
      spareQuantity: command.spareQuantity,
      deliveryMinutes: command.deliveryMinutes,
      qualifiedEngineerAvailable: command.qualifiedEngineerAvailable
    }
  }
}

function artifact(
  key: string,
  payload: object & {
    artifactRevision: number
    status: string
    evidence?: EvidenceRecord[]
    confidence?: number
  },
  agentKey: string | null
): ArtifactProjection {
  return {
    key,
    revision: payload.artifactRevision,
    status: payload.status,
    payload,
    evidence: payload.evidence ?? [],
    confidence: payload.confidence ?? null,
    agentKey
  }
}

function simulatedActions(startedAt: string): RecoveryAction[] {
  const definitions: Array<[string, RecoveryAction['system'], string, number]> = [
    ['mes-pause-m07', 'MES', '暂停 M-07 当前工单', 1],
    ['cmms-create-repair', 'CMMS', '创建紧急维修工单', 2],
    ['cmms-assign-engineer', 'CMMS', '指派合格维修工程师', 3],
    ['wms-reserve-bearing', 'WMS', '锁定并出库主轴轴承', 4],
    ['agv-deliver-bearing', 'AGV', '配送备件至 A 线', 10],
    ['aps-recalculate', 'APS', '重新计算约束排程', 7],
    ['mes-migrate-orders', 'MES', '迁移两张紧急工单至 B 线', 9],
    ['mes-changeover-task', 'MES', '创建夹具更换与首件确认任务', 11],
    ['qms-quarantine', 'QMS', '隔离 126 件风险产品', 5],
    ['qms-reinspection', 'QMS', '创建追加检测任务', 6],
    ['erp-update-eta', 'ERP', '更新订单预计完工时间', 12],
    ['mes-start-monitoring', 'MES', '启动维修与生产恢复监控', 13]
  ]
  return definitions.map(([key, system, title, minute], index) => ({
    key,
    system,
    title,
    status: 'confirmed',
    externalReference: `SIM-${system}-${String(index + 1).padStart(3, '0')}`,
    confirmedAt: addMinutes(startedAt, minute),
    failureCode: null
  }))
}

function completedStepCount(state: FactoryCaseState) {
  return (
    1 +
    Number(Boolean(state.triage)) +
    Object.values(state.findings).filter(Boolean).length +
    Number(Boolean(state.plan)) +
    Number(state.plan?.approval.status === 'approved') +
    Number(Boolean(state.execution)) +
    Number(Boolean(state.verification))
  )
}

function nextAction(state: FactoryCaseState) {
  if (!state.triage) return 'Run anomaly triage.'
  if (!allFindingsComplete(state)) return 'Dispatch equipment, quality, production, and resource specialists.'
  if (!state.plan) return 'Generate deterministic recovery options.'
  if (state.plan.approval.status === 'pending') return 'A production operations approver must review plan B.'
  if (state.plan.approval.status === 'rejected') return 'Escalate for a revised human recovery decision.'
  if (!state.execution) return 'Execute the approved recovery plan through governed adapters.'
  if (state.execution.status === 'partial_failure') return 'Remediate failed external actions manually.'
  if (!state.verification) return 'Verify equipment, quality, and production recovery.'
  return state.verification.outcome === 'recovered'
    ? 'Review the evidence chain and close the incident.'
    : 'Escalate to human intervention.'
}

function allowedActions(state: FactoryCaseState) {
  if (!state.triage) return ['run_specialist_analysis']
  if (!allFindingsComplete(state) || !state.plan) return ['run_specialist_analysis']
  if (state.plan.approval.status === 'pending') {
    return ['approve_recovery_plan', 'reject_recovery_plan']
  }
  if (state.plan.approval.status === 'approved' && !state.execution) {
    return ['execute_recovery_plan']
  }
  if (state.execution?.status === 'completed' && !state.verification) {
    return ['verify_recovery']
  }
  return []
}

function allFindingsComplete(state: FactoryCaseState) {
  return Object.values(state.findings).every(Boolean)
}

function requireTriage(state: FactoryCaseState) {
  if (!state.triage) invalid('factory_triage_required', 'Triage must be completed first.')
}

function requirePendingPlan(state: FactoryCaseState) {
  if (!state.plan || state.plan.status !== 'proposed' || state.plan.approval.status !== 'pending') {
    invalid('factory_plan_not_pending', 'A pending recovery plan is required.')
  }
  return state.plan
}

function requiredFinding<T>(value: T | null, kind: string): T {
  if (!value) invalid('factory_finding_missing', `${kind} finding is missing.`)
  return value
}

function required<T>(value: T | null): T {
  if (value === null) throw new Error('Required domain artifact is missing.')
  return value
}

function findingTitle(kind: FactoryFindingKind) {
  return {
    equipment: '设备诊断完成',
    quality: '质量影响评估完成',
    production: '订单与排产影响评估完成',
    resources: '备件与维修资源核验完成'
  }[kind]
}

function findingArtifactKey(kind: FactoryFindingKind) {
  return {
    equipment: 'equipment-diagnosis',
    quality: 'quality-impact',
    production: 'production-impact',
    resources: 'resource-readiness'
  }[kind]
}

function timeline(
  key: string,
  occurredAt: string,
  title: string,
  actor: string,
  status: FactoryTimelineEvent['status'] = 'completed'
): FactoryTimelineEvent {
  return { key, occurredAt, title, actor, status }
}

function evidence(
  source: EvidenceRecord['source'],
  reference: string,
  observedAt: string,
  summary: string,
  value?: number,
  unit?: string
): EvidenceRecord {
  return { source, reference, observedAt, summary, value, unit }
}

function secondsBetween(from: string, to: string) {
  return Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000))
}

function addMinutes(value: string, minutes: number) {
  return new Date(Date.parse(value) + minutes * 60_000).toISOString()
}

function invalid(errorCode: string, message: string): never {
  throw new BadRequestException({ errorCode, message })
}

function conflict(errorCode: string, message: string): never {
  throw new ConflictException({ errorCode, message })
}
