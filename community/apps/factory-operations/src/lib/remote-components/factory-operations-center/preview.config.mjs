import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const platformRoot = resolve(
  process.env.XPERT_PLATFORM_ROOT ?? resolve(componentRoot, '../../../../../../../../xpert')
)
const caseId = '00000000-0000-4000-8000-000000000070'
const projectId = '10000000-0000-4000-8000-000000000070'

export { platformRoot }

export default {
  title: 'Factory Operations Center · Remote View Preview',
  frameTitle: 'Factory Operations Center',
  workspaceRoot: platformRoot,
  instanceId: 'factory-operations-preview',
  component: { root: componentRoot, runtime: 'react', title: 'Factory Operations Center' },
  hostContext: {
    manifest: { key: 'factory-operations-center' },
    payload: {},
    initialQuery: { page: 1, pageSize: 20, parameters: {} },
    locale: 'zh-Hans',
    theme: {
      mode: 'light',
      tokens: {
        colorBackground: '#f8faf9',
        colorForeground: '#18201e',
        colorCard: '#ffffff',
        colorCardForeground: '#18201e',
        colorPopover: '#ffffff',
        colorPopoverForeground: '#18201e',
        colorMuted: '#f1f5f3',
        colorMutedForeground: '#66736f',
        colorSecondary: '#edf3f1',
        colorSecondaryForeground: '#24423a',
        colorAccent: '#e7f5f1',
        colorAccentForeground: '#0f766e',
        colorBorder: '#dce5e1',
        colorInput: '#dce5e1',
        colorPrimary: '#0f766e',
        colorPrimaryForeground: '#ffffff',
        colorRing: '#2a9187',
        colorSuccess: '#0f766e',
        colorWarning: '#d97706',
        radiusMd: '0.5rem'
      }
    },
    debug: { enabled: false, production: true }
  },
  state: {
    stage: -1,
    actions: [],
    assistantTasks: [],
    navigations: [],
    notifications: [],
    requestDataCount: 0,
    runtimeProjectId: null
  },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      state.requestDataCount += 1
      const selectedCase = state.stage < 0 ? null : factoryCase(state.stage)
      return {
        data: {
          tableKey: 'cases',
          table: {
            key: 'cases',
            items: selectedCase ? [selectedCase] : [],
            total: selectedCase ? 1 : 0,
            page: 1,
            pageSize: 20
          },
          selectedCase,
          projection: selectedCase ? factoryProjection(state.stage, selectedCase) : null,
          selectedNodeKey: null,
          runtimeProjectId: state.runtimeProjectId,
          simulation: true
        }
      }
    }
    if (message.type === 'invokeClientCommand') {
      if (message.commandKey === 'workbench.navigation.open') {
        state.navigation = structuredClone(message.payload)
        state.navigations.push(structuredClone(message.payload))
        if (message.payload?.target === 'assistant.project') {
          state.runtimeProjectId = message.payload.projectId
        }
      } else {
        throw new Error('Unsupported preview client command.')
      }
      return { result: { success: true } }
    }
    if (message.type === 'executeAction') {
      const expected = {
        create_demo_incident: -1,
        dispatch_assistant_task: 0,
        approve_recovery_plan: 1,
        reject_recovery_plan: 1,
        execute_recovery_plan: 2,
        verify_recovery: 3
      }[message.actionKey]
      if (expected === undefined) throw new Error(`Unsupported preview action '${message.actionKey}'.`)
      if (state.stage !== expected) {
        return { result: { success: false, message: { en_US: 'Preview stage conflict', zh_Hans: '预览阶段冲突' } } }
      }
      state.actions.push({ actionKey: message.actionKey, input: structuredClone(message.input) })
      if (message.actionKey === 'dispatch_assistant_task') {
        state.assistantTasks.push(structuredClone(message.input))
        state.stage = 1
      } else if (message.actionKey === 'reject_recovery_plan') state.stage = 5
      else state.stage += 1
      const current = factoryCase(state.stage)
      return {
        result: {
          success: true,
          refresh: true,
          data: {
            caseId,
            revision: current.revision,
            status: current.status,
            nextAction: current.nextAction
          }
        }
      }
    }
    throw new Error(`Unsupported preview request '${message.type}'.`)
  },
  async handleEvent(message, { state }) {
    if (message.type === 'notify') state.notifications.push({ level: message.level, message: message.message })
    return {}
  }
}

function factoryProjection(stage, current) {
  const lanes = [
    ['event-intake', '事件接入', 'anomaly-triage-specialist', '工厂异常研判助手', 'Agent_AnomalyTriage', 'rotating_light', '1f6a8'],
    ['equipment-engineering', '设备工程', 'equipment-diagnostics-specialist', '设备故障诊断助手', 'Agent_EquipmentDiagnostics', 'wrench', '1f527'],
    ['quality-management', '质量管理', 'quality-risk-specialist', '质量风险评估助手', 'Agent_QualityImpact', 'shield', '1f6e1-fe0f'],
    ['production-planning', '生产计划', 'production-impact-specialist', '生产影响分析助手', 'Agent_ProductionImpact', 'calendar', '1f4c6'],
    ['maintenance-and-logistics', '维修与物流', 'resource-readiness-specialist', '维修资源就绪助手', 'Agent_ResourceReadiness', 'package', '1f4e6'],
    ['recovery-planning', '恢复规划', 'recovery-planning-specialist', '恢复方案规划助手', 'Agent_RecoveryPlanning', 'compass', '1f9ed'],
    ['operations-approval', '运营审批', 'operations-approval-advisor', '生产运营审批顾问', 'Agent_OperationsApprovalAdvisor', 'construction_worker', '1f477'],
    ['recovery-validation', '恢复验证', 'recovery-verification-specialist', '生产恢复验证助手', 'Agent_RecoveryVerification', 'white_check_mark', '2705']
  ].map(([key, title, accountableRoleKey, displayName, primaryAgentKey, avatarId, avatarUnified], order) => ({
    key, title, accountableRoleKey, order,
    assistant: {
      displayName, name: `${key}-assistant`, avatar: { emoji: { id: avatarId, unified: avatarUnified }, background: 'rgb(231, 248, 241)' },
      avatarFallback: displayName.slice(0, 2), status: 'available', templateKey: `${key}-assistant`, primaryAgentKey,
      publishedVersion: '1'
    },
    recentExecutions: []
  }))
  const stages = [
    ['detection', '异常检测'], ['triage', '异常研判'], ['parallel-analysis', '并行会诊'],
    ['planning', '方案协商'], ['approval', '人工审批'], ['execution', '受控执行'], ['closure', '恢复闭环']
  ].map(([key, title], order) => ({ key, title, order }))
  const defs = [
    ['detect-anomaly', '检测异常', 'event-intake', 'detection', 'system'],
    ['triage-event', '确认异常真实性', 'event-intake', 'triage', 'assistant_task'],
    ['diagnose-equipment', '诊断设备失效模式', 'equipment-engineering', 'parallel-analysis', 'assistant_task'],
    ['assess-quality-impact', '评估质量隔离范围', 'quality-management', 'parallel-analysis', 'assistant_task'],
    ['assess-production-impact', '评估生产与交付影响', 'production-planning', 'parallel-analysis', 'assistant_task'],
    ['check-resource-readiness', '核验备件与维修资源', 'maintenance-and-logistics', 'parallel-analysis', 'assistant_task'],
    ['generate-recovery-plan', '生成 A/B/C 恢复方案', 'recovery-planning', 'planning', 'assistant_task'],
    ['route-execution-authority', '审批路由', 'operations-approval', 'approval', null],
    ['approve-recovery-plan', '生产运营负责人审批', 'operations-approval', 'approval', 'human'],
    ['execute-recovery-plan', '执行已批准恢复方案', 'operations-approval', 'execution', 'system'],
    ['verify-recovery', '验证设备、质量与生产恢复', 'recovery-validation', 'closure', 'assistant_task'],
    ['recovery-route', '恢复结果路由', 'recovery-validation', 'closure', null],
    ['production-recovered', '生产恢复完成', 'recovery-validation', 'closure', 'system'],
    ['human-intervention-required', '转人工干预', 'operations-approval', 'closure', 'human']
  ]
  const completedByStage = [1, 7, 9, 10, 14][Math.min(stage, 4)]
  const readyKey = ['triage-event', 'approve-recovery-plan', 'execute-recovery-plan', 'verify-recovery', null][Math.min(stage, 4)]
  const nodes = defs.map(([key, title, laneKey, stageKey, executionMode], index) => {
    const completed = index < completedByStage
    const status = key === readyKey ? 'ready' : completed ? 'completed' : 'blocked'
    const attempt = completed && executionMode === 'assistant_task' ? executionRecord(key, laneKey, index) : null
    return {
      key, kind: key.includes('route') ? 'router' : key === 'production-recovered' || key === 'human-intervention-required' ? 'terminal' : 'task',
      title, laneKey, stageKey, accountableRoleKey: lanes.find((lane) => lane.key === laneKey)?.accountableRoleKey ?? null,
      executionMode, status,
      openMode: ['detect-anomaly', 'approve-recovery-plan', 'execute-recovery-plan'].includes(key) ? 'dialog' : executionMode === 'assistant_task' ? 'view' : null,
      workspaceKey: executionMode === 'assistant_task' ? 'factory-case-workspace' : null,
      authorizedActions: key === 'approve-recovery-plan' ? ['approve_recovery_plan', 'reject_recovery_plan'] : key === 'execute-recovery-plan' ? ['execute_recovery_plan'] : key === 'verify-recovery' ? ['verify_recovery'] : [],
      blockers: status === 'blocked' ? [{ code: `wait-${key}`, title: '等待服务端前置条件完成', ownerRoleKey: 'Agent_FactoryCoordinator', since: current.event.occurredAt, retryable: false }] : [],
      executionSummary: { attemptCount: attempt ? 1 : 0, latestStatus: attempt?.status ?? null, attempts: attempt ? [attempt] : [] }
    }
  })
  const edges = defs.slice(0, -1).map((definition, index) => ({ from: definition[0], to: defs[index + 1][0], state: index < completedByStage ? 'selected' : 'inactive', label: null }))
  return {
    case: { id: current.id, title: current.event.title, status: current.status, revision: current.revision, templateKey: 'factory_anomaly_recovery', templateVersion: 3, context: [
      { key: 'asset', label: '设备', value: current.event.deviceName }, { key: 'line', label: '产线', value: `${current.event.lineId} 线` },
      { key: 'severity', label: '严重度', value: current.event.severity.toUpperCase() }, { key: 'orders', label: '风险订单', value: `${current.event.riskOrderCount}` }
    ] },
    summary: { completed: nodes.filter((node) => node.status === 'completed').length, active: 0, blocked: nodes.filter((node) => node.status === 'blocked').length, pending: nodes.filter((node) => node.status === 'ready').length },
    lanes, stages, nodes, edges, routeDecisions: [], executableNodeKeys: readyKey ? [readyKey] : [], routeRevision: current.revision,
    refreshedAt: '2026-08-31T06:45:00.000Z'
  }
}

function executionRecord(nodeKey, laneKey, index) {
  return {
    recordId: `record-${nodeKey}`, caseId, sequence: index + 1, attemptNumber: 1, nodeKey,
    roleKey: laneKey, roleLabel: laneKey, agentKey: `Agent_${laneKey}`, status: 'succeeded',
    startedAt: '2026-08-31T06:00:00.000Z', finishedAt: '2026-08-31T06:01:00.000Z', inputRevision: index,
    outputRevision: index + 1, safeSummary: `${nodeKey} persisted successfully`, conversationId: `conversation-${nodeKey}`,
    threadId: `thread-${nodeKey}`, executionId: `execution-${nodeKey}`, supersededByRecordId: null
  }
}

function factoryCase(stage) {
  const now = '2026-08-31T06:00:00.000Z'
  const triage = stage >= 1 ? finding('Agent_AnomalyTriage', 'IoT 趋势与规则共同确认异常有效。', 0.99, [
    evidence('iot', 'telemetry:M-07:vibration', '主轴振动升至 8.7 mm/s'),
    evidence('rule', 'rule:grinder-bearing-critical-v3', '振动与温度组合达到严重阈值')
  ]) : null
  const findings = stage >= 1 ? {
    equipment: finding('Agent_EquipmentDiagnostics', '主轴轴承早期失效，建议立即停机。', 0.96, [evidence('cmms', 'history:M-07:spindle-bearing', '历史故障模式匹配')]),
    quality: finding('Agent_QualityImpact', '隔离最近 90 分钟生产的 126 件产品。', 0.95, [evidence('qms', 'spc:M-07:dimension', '尺寸均值接近控制上限')]),
    production: finding('Agent_ProductionImpact', 'B 线换装后可承接两张紧急工单。', 0.94, [evidence('aps', 'capacity:B-line:260831', 'B 线具备替代产能')]),
    resources: finding('Agent_ResourceReadiness', '备件 18 分钟可达且工程师具备资质。', 0.98, [evidence('wms', 'stock:BRG-M07-01', '可用库存 1 件')])
  } : { equipment: null, quality: null, production: null, resources: null }
  const plan = stage >= 1 ? {
    artifactRevision: stage >= 2 ? 2 : 1,
    status: stage === 1 ? 'proposed' : stage === 5 ? 'rejected' : 'approved',
    options: [
      option('A', '原地停机维修', '暂停 M-07 并等待维修完成后恢复原工单。', 210, 0, false, 'low'),
      option('B', '停机维修并切换 B 线', '停机维修 M-07，同时将两张紧急工单切换至 B 线并执行首件确认。', 0, 1800, true, 'low'),
      option('C', '继续运行后维修', '继续运行至紧急工单完成，再停机维修。', 0, 600, false, 'unacceptable')
    ],
    recommendedOptionId: 'B',
    selectedOptionId: stage >= 2 && stage !== 5 ? 'B' : null,
    executionAuthority: 'approval-required',
    rationale: '方案 B 在保障设备与质量安全的前提下避免订单延期。',
    approval: {
      status: stage === 1 ? 'pending' : stage === 5 ? 'rejected' : 'approved',
      actorId: stage >= 2 ? 'preview-user' : null,
      reason: stage >= 2 ? '批准方案 B 并切换 B 线。' : null,
      decidedAt: stage >= 2 ? '2026-08-31T06:04:00.000Z' : null,
      caseRevision: stage >= 2 ? 8 : null
    }
  } : null
  const execution = stage >= 3 && stage !== 5 ? {
    artifactRevision: 1,
    status: 'completed',
    mode: 'simulation',
    actions: Array.from({ length: 12 }, (_, index) => ({
      key: `action-${String(index + 1).padStart(2, '0')}`,
      system: ['MES', 'CMMS', 'WMS', 'AGV', 'APS', 'QMS'][index % 6],
      title: `恢复动作 ${index + 1}`,
      status: 'confirmed',
      externalReference: `SIM-${index + 1}`,
      confirmedAt: '2026-08-31T06:42:00.000Z',
      failureCode: null
    }))
  } : null
  const verification = stage >= 4 && stage !== 5 ? {
    artifactRevision: 1,
    status: 'completed',
    outcome: 'recovered',
    verifiedAt: '2026-08-31T06:44:00.000Z',
    summary: '设备、首件质量和紧急订单三项恢复条件均已满足。',
    confidence: 0.98,
    agentKey: 'Agent_RecoveryVerification',
    evidence: [
      evidence('iot', 'telemetry:M-07:vibration', '主轴振动恢复至 2.1 mm/s'),
      evidence('qms', 'inspection:first-article:B-line', 'B 线首件检验通过'),
      evidence('mes', 'work-order:SO-260831-07', '紧急订单恢复生产')
    ]
  } : null
  const status = ['investigating', 'awaiting_approval', 'approved', 'verifying', 'recovered', 'rejected'][stage]
  const currentStage = ['triage-event', 'approve-recovery-plan', 'execute-recovery-plan', 'verify-recovery', 'production-recovered', 'human-intervention-required'][stage]
  const revisions = [1, 7, 8, 9, 10, 8]
  const nextActions = [
    '派发异常研判 Agent。',
    '等待生产运营负责人审批方案 B。',
    '在 Workbench 执行已批准方案。',
    '派发恢复验证 Agent。',
    '生产已恢复，审阅证据链。',
    '恢复方案被拒绝，转人工处置。'
  ]
  const timeline = [timelineItem('anomaly-detected', now, '检测到 M-07 严重设备异常', 'IoT 规则引擎')]
  if (stage >= 1) {
    timeline.push(
      timelineItem('triage-completed', '2026-08-31T06:00:06.000Z', '异常真实性与影响范围已确认', '异常研判 Agent'),
      timelineItem('equipment-analysis-completed', '2026-08-31T06:01:00.000Z', '设备故障模式与安全边界已确认', '设备诊断 Agent'),
      timelineItem('quality-analysis-completed', '2026-08-31T06:01:01.000Z', '质量隔离范围已确认', '质量影响 Agent'),
      timelineItem('production-analysis-completed', '2026-08-31T06:01:02.000Z', '生产与交付影响已确认', '生产影响 Agent'),
      timelineItem('resources-analysis-completed', '2026-08-31T06:01:03.000Z', '维修资源与备件已确认', '资源就绪 Agent'),
      timelineItem('plan-generated', '2026-08-31T06:02:00.000Z', '三套恢复方案已生成，推荐方案 B', '恢复规划 Agent')
    )
  }
  if (stage >= 2 && stage !== 5) timeline.push(timelineItem('plan-approved', '2026-08-31T06:04:00.000Z', '生产运营负责人批准方案 B', 'preview-user'))
  if (stage >= 3 && stage !== 5) timeline.push(timelineItem('execution-completed', '2026-08-31T06:42:00.000Z', '12 项恢复动作获得模拟系统确认', 'Factory simulator'))
  if (stage >= 4 && stage !== 5) timeline.push(timelineItem('recovery-verified', '2026-08-31T06:44:00.000Z', '生产恢复条件验证通过，事件关闭', '恢复验证 Agent'))
  if (stage === 5) timeline.push({ ...timelineItem('plan-rejected', '2026-08-31T06:04:00.000Z', '恢复方案被拒绝，转人工处置', 'preview-user'), status: 'failed' })
  return {
    id: caseId,
    caseKey: 'FAC-260831-M07',
    workspace: {
      projectId,
      status: 'ready',
      canLaunchTasks: true,
      errorCode: null
    },
    revision: revisions[stage],
    status,
    currentStage,
    event: {
      eventId: 'EVT-FAC-260831-M07', deviceId: 'M-07', deviceName: '磨削中心 M-07', lineId: 'A', severity: 'critical', occurredAt: now,
      title: '主轴振动趋势异常', summary: '主轴振动与轴承温度持续上升，加工尺寸接近质量控制边界。',
      telemetry: { vibrationMmS: 8.7, bearingTemperatureC: 86.4, dimensionTrend: 'approaching_limit' },
      impactedWorkOrders: ['WO-260831-017', 'WO-260831-021', 'WO-260831-024'], impactedProductQuantity: 126, riskOrderCount: 2
    },
    triage,
    findings,
    plan,
    execution,
    verification,
    timeline,
    metrics: { responseSeconds: stage >= 1 ? 6 : null, recoveryMinutes: stage >= 4 ? 44 : null, avoidedDowntimeMinutes: stage >= 4 ? 210 : 0, avoidedLossCny: stage >= 4 ? 186000 : 0 },
    progress: { completedSteps: [1, 7, 8, 9, 10, 8][stage], totalSteps: 10, percent: [10, 70, 80, 90, 100, 80][stage] },
    nextAction: nextActions[stage],
    allowedActions: stage === 1 ? ['approve_recovery_plan', 'reject_recovery_plan'] : stage === 2 ? ['execute_recovery_plan'] : stage === 3 ? ['verify_recovery'] : []
  }
}

function finding(agentKey, summary, confidence, records) {
  return { artifactRevision: 1, status: 'completed', agentKey, summary, confidence, evidence: records }
}

function evidence(source, reference, summary) {
  return { source, reference, observedAt: '2026-08-31T06:00:00.000Z', summary }
}

function option(id, title, description, deliveryDelayMinutes, incrementalCostCny, recommended, risk) {
  return { id, title, description, deliveryDelayMinutes, incrementalCostCny, safetyRisk: risk, qualityRisk: risk, recommended, rationale: description }
}

function timelineItem(key, occurredAt, title, actor) {
  return { key, occurredAt, title, actor, status: 'completed' }
}
