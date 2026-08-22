import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const componentRoot = dirname(fileURLToPath(import.meta.url))
const pluginRoot = resolve(componentRoot, '../../../..')

const valve = {
  entityId: 'urn:valve:V-101', entityTypeCode: 'valve', externalKey: 'V-101', label: 'Main Steam Isolation Valve V-101',
  score: 1, snapshotId: 'snapshot-valve-2026-08', graphVersion: 'graph-42', partitionKey: 'plant-a',
  attributes: { valve_type: 'Gate Valve', nominal_size: 'DN200', pressure_rating: 'Class 600', material: 'A216 WCB', fire_safe_certified: true },
  constraintRefs: ['pressure_envelope'], evidence: { source: 'NISTIR 8035 Section 5.1.4', drawing: 'P&ID-1002' }
}

const object360 = {
  resourceId: 'valve-engineering-ready', snapshotId: 'snapshot-valve-2026-08', graphVersion: 'graph-42',
  ontologyId: 'valve-engineering', partitionKey: 'plant-a', entity: valve,
  relationGroups: [
    { relationTypeCode: 'has_part', direction: 'outbound', items: [
      { relationId: 'rel-1', relatedEntityId: 'urn:component:body', relatedEntityTypeCode: 'valve_component', relatedEntityExternalKey: 'BODY-V101', relatedEntityLabel: 'Valve Body', attributes: { material: 'A216 WCB' } },
      { relationId: 'rel-2', relatedEntityId: 'urn:actuator:A-101', relatedEntityTypeCode: 'actuator', relatedEntityExternalKey: 'A-101', relatedEntityLabel: 'Electric Actuator A-101', attributes: { torque_nm: 1800 } }
    ] },
    { relationTypeCode: 'complies_with', direction: 'outbound', items: [
      { relationId: 'rel-3', relatedEntityId: 'urn:standard:API-600', relatedEntityTypeCode: 'standard', relatedEntityExternalKey: 'API-600', relatedEntityLabel: 'API 600', attributes: {} }
    ] }
  ],
  relatedObjects: [
    { entityId: 'urn:component:body', entityTypeCode: 'valve_component', externalKey: 'BODY-V101', label: 'Valve Body', attributes: { material: 'A216 WCB' }, constraintRefs: [], evidence: { drawing: 'GA-V101' } },
    { entityId: 'urn:standard:API-600', entityTypeCode: 'standard', externalKey: 'API-600', label: 'API 600', attributes: { edition: '2021' }, constraintRefs: [], evidence: { source: 'API' } }
  ],
  constraints: [
    { code: 'pressure_envelope', summary: 'Design pressure must not exceed Class 600 allowable pressure at design temperature.', severity: 'warning', shapeRef: 'shape:valve-pressure' }
  ],
  evidence: { source: 'NISTIR 8035 Section 5.1.4', drawing: 'P&ID-1002', row: 'Valve Schedule 18' },
  availableActions: [
    { code: 'request_engineering_review', name: 'Request engineering review', description: 'Create a review request for pressure envelope evidence.', riskLevel: 'MEDIUM', requiresApproval: true, intentTags: ['review'] }
  ]
}

const demoActions = [
  action('create_maintenance_work_order', '创建阀门维护工单', 'HIGH', 'Demo EAM', 'mock_external', {
    problem: '阀杆填料处存在轻微泄漏', priority: 'P2', dueDate: '2026-09-15'
  }, ['阀门存在稳定对象标识', '当前无同类未关闭维护工单'], ['生成维护工单编号', '关联当前阀门及证据', '工单进入待派工状态']),
  action('schedule_valve_inspection', '安排阀门专项巡检', 'MEDIUM', 'Demo Inspection', 'mock_external', {
    inspectionType: '泄漏与执行机构专项巡检', scheduledDate: '2026-09-05', scope: '阀体、填料函、执行机构与限位反馈'
  }, ['阀门对象可定位', '计划日期有效'], ['生成巡检任务编号', '记录检查范围和计划日期']),
  action('raise_quality_deviation', '发起质量偏差', 'HIGH', 'Demo QMS', 'mock_external', {
    deviation: '材料证明书与阀门数据表牌号需要复核', standard: 'API 600', disposition: '暂停放行并由质量工程师复核'
  }, ['存在可引用的标准或检验证据'], ['生成质量偏差编号', '保留证据和标准引用']),
  action('request_spare_part', '申请阀门备件', 'MEDIUM', 'Demo Procurement', 'mock_external', {
    component: '阀杆填料组件', quantity: 1, requiredDate: '2026-09-12'
  }, ['部件与当前阀门的关系可解释'], ['生成备件申请编号', '申请进入待采购评审状态']),
  action('request_valve_replacement', '申请阀门更换评审', 'HIGH', 'Engineering Review', 'internal', {
    reason: '重复泄漏且关键密封面修复价值较低', window: '下一次装置停车窗口'
  }, ['更换理由与证据可追溯'], ['生成更换评审编号', '汇总技术依据']),
  action('isolate_valve', '模拟阀门隔离', 'CRITICAL', 'Isolation Simulator', 'simulation_only', {
    reason: '维护前隔离影响演示', permit: 'PTW-DEMO-001'
  }, ['仅允许模拟', '不连接 DCS/SIS 控制通道'], ['生成隔离模拟回执', '明确未发送任何现场控制命令']),
  action('request_engineering_review', '请求工程复核', 'LOW', 'Engineering Review', 'internal', {
    question: '确认设计温度下的压力等级适用性', discipline: '静设备/管道'
  }, ['问题与当前阀门相关'], ['生成工程复核任务', '保留阀门快照和证据引用'])
]

const proposal = {
  id: '50000000-0000-4000-8000-000000000001', operationId: 'preview-op-1', resourceId: object360.resourceId,
  snapshotId: object360.snapshotId, graphVersion: object360.graphVersion, entityId: valve.entityId, entityLabel: valve.label,
  kind: 'engineering_review', actionTypeCode: null, title: 'Review pressure envelope evidence',
  summary: 'Confirm the operating temperature and allowable pressure curve before service approval.',
  expectedEffects: ['Validated pressure envelope', 'Traceable engineering decision'], status: 'pending_review',
  actionInput: { question: '确认设计温度下的压力等级适用性', discipline: '静设备/管道' },
  createdAt: '2026-08-22T08:00:00.000Z', updatedAt: '2026-08-22T08:00:00.000Z'
}

export default {
  title: 'Valve Business Workbench · Local Preview',
  workspaceRoot: pluginRoot,
  instanceId: 'valve-business-workbench-preview',
  component: { root: componentRoot, runtime: 'react' },
  hostContext: {
    manifest: { key: 'valve_business_workbench' }, payload: {},
    initialQuery: { pageSize: 30, parameters: { resourceId: object360.resourceId } }, locale: 'zh-Hans',
    theme: { mode: 'light', tokens: { background: '#f8fafc', foreground: '#17202a', primary: '#0f766e', border: '#e2e8f0' } }
  },
  state: { proposals: [proposal], audit: [], commands: [] },
  async handleRequest(message, { state }) {
    if (message.type === 'requestData') {
      const mode = message.query?.parameters?.mode
      if (mode === 'resources') return { data: { meta: { mode, items: [{ resourceId: object360.resourceId, displayName: 'Valve Engineering Ontology', snapshotId: object360.snapshotId, graphVersion: object360.graphVersion, updatedAt: '2026-08-22T08:00:00.000Z', rootEntityTypeCode: 'valve' }] } } }
      if (mode === 'schema') return { data: { meta: { mode, schema: { resourceId: object360.resourceId, snapshotId: object360.snapshotId, graphVersion: object360.graphVersion, ontologyId: object360.ontologyId, rootEntityTypeCode: 'valve', entityTypes: [{ code: 'valve', name: 'Valve', aliases: [], attributeCodes: Object.keys(valve.attributes) }, { code: 'valve_component', name: 'Valve Component', aliases: [], attributeCodes: ['material'] }, { code: 'standard', name: 'Standard', aliases: [], attributeCodes: ['edition'] }], relationTypes: [], actionTypes: [] } } } }
      if (mode === 'objects') {
        const search = String(message.query?.search ?? '').trim().toLowerCase()
        const items = search && !`${valve.label} ${valve.externalKey}`.toLowerCase().includes(search) ? [] : [valve]
        return { data: { meta: { mode, taskId: 'preview-search', resourceId: object360.resourceId, snapshotId: object360.snapshotId, graphVersion: object360.graphVersion, items } } }
      }
      if (mode === 'object360') return { data: { meta: { mode, object: object360 } } }
      if (mode === 'actions') return { data: { meta: { mode, resourceId: object360.resourceId, snapshotId: object360.snapshotId, graphVersion: object360.graphVersion, entityId: valve.entityId, items: demoActions } } }
      if (mode === 'proposals') return { data: { meta: { mode, items: state.proposals } } }
      if (mode === 'audit') return { data: { meta: { mode, items: state.audit } } }
    }
    if (message.type === 'invokeClientCommand') {
      state.commands.push({ commandKey: message.commandKey, payload: message.payload })
      return { result: { success: true } }
    }
    if (message.type === 'executeAction') {
      if (message.actionKey === 'create_demo_proposal') {
        const selectedAction = demoActions.find((entry) => entry.code === message.input?.actionTypeCode)
        if (!selectedAction) throw new Error('Demo action not found')
        const createdAt = '2026-08-22T08:03:00.000Z'
        const created = {
          id: `50000000-0000-4000-8000-${String(state.proposals.length + 2).padStart(12, '0')}`,
          operationId: `preview-op-${state.proposals.length + 1}`,
          resourceId: object360.resourceId, snapshotId: object360.snapshotId, graphVersion: object360.graphVersion,
          entityId: valve.entityId, entityLabel: valve.label, kind: 'ontology_action', actionTypeCode: selectedAction.code,
          title: `Demo · ${selectedAction.name}`, summary: selectedAction.scenario,
          expectedEffects: selectedAction.expectedEffects, actionInput: selectedAction.demoDefaults,
          evidence: { demoMode: true, actionSource: selectedAction.source }, status: 'pending_review',
          createdAt, updatedAt: createdAt
        }
        state.proposals.unshift(created)
        state.audit.push({ id: `event-${state.audit.length + 1}`, proposalId: created.id, eventType: 'proposal_created', fromStatus: null, toStatus: 'pending_review', actorId: 'preview-user', comment: null, payload: { demoMode: true }, createdAt, source: 'workbench' })
        return { result: { success: true, data: created } }
      }
      const item = state.proposals.find((entry) => entry.id === message.targetId)
      if (!item) throw new Error('Proposal not found')
      if (message.actionKey === 'execute_demo_action') {
        if (item.status !== 'approved') throw new Error('PROPOSAL_NOT_APPROVED')
        const selectedAction = demoActions.find((entry) => entry.code === item.actionTypeCode)
        const failed = message.input?.demoOutcome === 'failure'
        const completedAt = '2026-08-22T08:06:00.000Z'
        const externalReference = `${prefix(item.actionTypeCode)}-DEMO-${item.id.slice(-8).toUpperCase()}`
        for (const [eventType, phase] of [['execution_queued', 'queued'], ['execution_started', 'executing']]) {
          state.audit.push({ id: `event-${state.audit.length + 1}`, proposalId: item.id, eventType, fromStatus: 'approved', toStatus: 'approved', actorId: 'preview-user', comment: null, payload: { phase, targetSystem: selectedAction?.targetSystem, demo: true }, createdAt: completedAt, source: 'workbench' })
        }
        item.status = failed ? 'failed' : 'completed'
        item.outcome = failed
          ? 'Demo 适配器返回模拟失败；未写入真实外部系统。'
          : `Demo 执行完成，生成回执 ${externalReference}；未写入真实外部系统。`
        item.updatedAt = completedAt
        state.audit.push({ id: `event-${state.audit.length + 1}`, proposalId: item.id, eventType: failed ? 'execution_failed' : 'execution_completed', fromStatus: 'approved', toStatus: item.status, actorId: 'preview-user', comment: item.outcome, payload: { phase: item.status, externalReference, targetSystem: selectedAction?.targetSystem, simulationOnly: selectedAction?.executionMode === 'simulation_only', demo: true }, createdAt: completedAt, source: 'workbench' })
        return { result: { success: true, data: item } }
      }
      const map = { approve_proposal: 'approved', reject_proposal: 'rejected' }
      const next = map[message.actionKey]
      if (!next) throw new Error('Unsupported action')
      const previous = item.status
      item.status = next
      item.updatedAt = '2026-08-22T08:05:00.000Z'
      state.audit.push({ id: `event-${state.audit.length + 1}`, proposalId: item.id, eventType: `proposal_${next}`, fromStatus: previous, toStatus: next, actorId: 'preview-user', comment: message.input?.comment ?? message.input?.outcome ?? null, createdAt: item.updatedAt, source: 'workbench' })
      return { result: { success: true, data: item } }
    }
    throw new Error(`Unsupported preview request '${message.type}'`)
  }
}

function action(code, name, riskLevel, targetSystem, executionMode, demoDefaults, preconditions, expectedEffects) {
  return {
    code, name, description: `${name}的客户演示场景。`, scenario: `针对 ${valve.label} 演示${name}的受控业务闭环。`,
    source: code === 'request_engineering_review' ? 'ontology' : 'demo', ontologyDefined: code === 'request_engineering_review',
    riskLevel, requiresApproval: true, executionMode, targetSystem, intentTags: [],
    inputFields: Object.entries(demoDefaults).map(([key, defaultValue]) => ({ key, label: key, type: typeof defaultValue === 'number' ? 'number' : 'string', required: true, defaultValue })), preconditions,
    expectedEffects, available: true, blockingReasons: [], demoDefaults
  }
}

function prefix(code) {
  return ({ create_maintenance_work_order: 'WO', schedule_valve_inspection: 'INS', raise_quality_deviation: 'NCR', request_spare_part: 'PR', request_valve_replacement: 'ENG', isolate_valve: 'SIM' })[code] ?? 'ACT'
}
