import type {
  ValveActionDescriptor,
  ValveActionExecutionMode,
  ValveActionInputField,
  ValveActionRiskLevel,
  ValveJsonObject,
  ValveObject360
} from './types'

interface DemoActionDefinition {
  code: string
  name: string
  description: string
  scenario: string
  riskLevel: ValveActionRiskLevel
  requiresApproval: boolean
  executionMode: ValveActionExecutionMode
  targetSystem: string
  intentTags: string[]
  inputHint: string
  inputFields: ValveActionInputField[]
  preconditions: string[]
  expectedEffects: string[]
}

const text = (key: string, label: string, required = true, defaultValue?: string | number | boolean): ValveActionInputField => ({
  key,
  label,
  type: key.toLowerCase().includes('date') ? 'date' : typeof defaultValue === 'number' ? 'number' : 'string',
  required,
  defaultValue
})

export const VALVE_DEMO_ACTIONS: readonly DemoActionDefinition[] = [
  {
    code: 'create_maintenance_work_order',
    name: '创建阀门维护工单',
    description: '基于阀门对象、约束和证据生成一张待派工的 EAM 维护工单。',
    scenario: '发现泄漏、卡涩或约束风险后，创建可追溯的维护工单。',
    riskLevel: 'HIGH',
    requiresApproval: true,
    executionMode: 'mock_external',
    targetSystem: 'Demo EAM',
    intentTags: ['maintenance', 'work-order'],
    inputHint: '提供故障现象、优先级和期望完成日期。',
    inputFields: [text('problem', '故障现象', true, '阀杆填料处存在轻微泄漏'), text('priority', '优先级', true, 'P2'), text('dueDate', '期望完成日期', true, '2026-09-15')],
    preconditions: ['阀门存在稳定对象标识', '当前无同类未关闭维护工单', '审批人确认影响范围'],
    expectedEffects: ['生成维护工单编号', '关联当前阀门及证据', '工单进入待派工状态']
  },
  {
    code: 'schedule_valve_inspection',
    name: '安排阀门专项巡检',
    description: '为当前阀门创建一项带日期和检查范围的 Demo 巡检任务。',
    scenario: '基于风险、检验周期或标准要求安排现场巡检。',
    riskLevel: 'MEDIUM',
    requiresApproval: true,
    executionMode: 'mock_external',
    targetSystem: 'Demo Inspection',
    intentTags: ['inspection', 'schedule'],
    inputHint: '提供巡检类型、计划日期和检查范围。',
    inputFields: [text('inspectionType', '巡检类型', true, '泄漏与执行机构专项巡检'), text('scheduledDate', '计划日期', true, '2026-09-05'), text('scope', '检查范围', true, '阀体、填料函、执行机构与限位反馈')],
    preconditions: ['阀门对象可定位', '计划日期有效'],
    expectedEffects: ['生成巡检任务编号', '记录检查范围和计划日期', '任务进入已计划状态']
  },
  {
    code: 'raise_quality_deviation',
    name: '发起质量偏差',
    description: '针对标准、材料或检验结果不一致创建 Demo 质量偏差记录。',
    scenario: '阀门材料证明、制造数据或标准符合性存在偏差。',
    riskLevel: 'HIGH',
    requiresApproval: true,
    executionMode: 'mock_external',
    targetSystem: 'Demo QMS',
    intentTags: ['quality', 'deviation'],
    inputHint: '提供偏差描述、所涉标准和处置建议。',
    inputFields: [text('deviation', '偏差描述', true, '材料证明书与阀门数据表牌号需要复核'), text('standard', '所涉标准', true, 'API 600'), text('disposition', '建议处置', true, '暂停放行并由质量工程师复核')],
    preconditions: ['存在可引用的标准或检验证据', '偏差描述可复核'],
    expectedEffects: ['生成质量偏差编号', '冻结为待评审状态', '保留证据和标准引用']
  },
  {
    code: 'request_spare_part',
    name: '申请阀门备件',
    description: '根据关联部件和维护需求生成 Demo 备件申请。',
    scenario: '检修需要填料、密封件、阀杆或执行机构备件。',
    riskLevel: 'MEDIUM',
    requiresApproval: true,
    executionMode: 'mock_external',
    targetSystem: 'Demo Procurement',
    intentTags: ['spare-part', 'procurement'],
    inputHint: '提供部件、数量和需求日期。',
    inputFields: [text('component', '备件/部件', true, '阀杆填料组件'), { ...text('quantity', '数量', true, 1), type: 'number' }, text('requiredDate', '需求日期', true, '2026-09-12')],
    preconditions: ['部件与当前阀门的关系可解释', '数量大于零'],
    expectedEffects: ['生成备件申请编号', '关联阀门和目标部件', '申请进入待采购评审状态']
  },
  {
    code: 'request_valve_replacement',
    name: '申请阀门更换评审',
    description: '创建 Demo 更换评审任务，不直接下达采购或现场更换指令。',
    scenario: '维修成本、失效风险或标准符合性表明应评估整阀更换。',
    riskLevel: 'HIGH',
    requiresApproval: true,
    executionMode: 'internal',
    targetSystem: 'Engineering Review',
    intentTags: ['replacement', 'engineering-review'],
    inputHint: '提供更换原因、计划窗口和工程依据。',
    inputFields: [text('reason', '更换原因', true, '重复泄漏且关键密封面修复价值较低'), text('window', '计划窗口', true, '下一次装置停车窗口'), text('basis', '工程依据', true, '维护记录、风险约束与 API 600 符合性复核')],
    preconditions: ['更换理由与证据可追溯', '审批人确认仅创建评审任务'],
    expectedEffects: ['生成更换评审编号', '汇总技术依据', '评审任务进入待分派状态']
  },
  {
    code: 'isolate_valve',
    name: '模拟阀门隔离',
    description: '只生成隔离影响模拟与操作票草案，绝不向 DCS/SIS 发送控制命令。',
    scenario: '演示高风险 Action 的强制审批、影响说明和模拟执行边界。',
    riskLevel: 'CRITICAL',
    requiresApproval: true,
    executionMode: 'simulation_only',
    targetSystem: 'Isolation Simulator',
    intentTags: ['isolation', 'safety', 'simulation'],
    inputHint: '提供隔离原因和许可编号。',
    inputFields: [text('reason', '隔离原因', true, '维护前隔离影响演示'), text('permit', '许可编号', true, 'PTW-DEMO-001')],
    preconditions: ['仅允许模拟', '必须经人工审批', '不连接 DCS/SIS 控制通道'],
    expectedEffects: ['生成隔离模拟回执', '列出受影响对象', '明确未发送任何现场控制命令']
  },
  {
    code: 'request_engineering_review',
    name: '请求工程复核',
    description: '为当前阀门创建内部工程复核任务。',
    scenario: '证据不足、约束告警或跨专业判断需要人工复核。',
    riskLevel: 'LOW',
    requiresApproval: true,
    executionMode: 'internal',
    targetSystem: 'Engineering Review',
    intentTags: ['review'],
    inputHint: '提供复核问题和希望确认的结论。',
    inputFields: [text('question', '复核问题', true, '确认设计温度下的压力等级适用性'), text('discipline', '专业', true, '静设备/管道')],
    preconditions: ['问题与当前阀门相关'],
    expectedEffects: ['生成工程复核任务', '保留对象快照和证据引用', '任务进入待分派状态']
  }
]

export function buildValveActionDescriptors(
  object: ValveObject360,
  options: { demoEnabled: boolean; includeFallbackActions: boolean }
): ValveActionDescriptor[] {
  const ontologyByCode = new Map(object.availableActions.map((action) => [action.code, action]))
  const demoByCode = new Map(VALVE_DEMO_ACTIONS.map((action) => [action.code, action]))
  const codes = new Set(object.availableActions.map((action) => action.code))
  if (options.demoEnabled && options.includeFallbackActions) {
    for (const action of VALVE_DEMO_ACTIONS) codes.add(action.code)
  }
  return [...codes].map((code) => {
    const ontology = ontologyByCode.get(code)
    const demo = demoByCode.get(code)
    const riskLevel = normalizeRisk(ontology?.riskLevel ?? demo?.riskLevel)
    const ontologyDefined = Boolean(ontology)
    const executable = Boolean(demo && options.demoEnabled)
    const blockingReasons = executable ? [] : ['NO_EXECUTION_ADAPTER']
    return {
      code,
      name: ontology?.name ?? demo?.name ?? code,
      description: ontology?.description ?? demo?.description ?? '本体定义的业务动作。',
      scenario: demo?.scenario ?? '由本体定义的阀门业务动作。',
      source: ontologyDefined ? 'ontology' : 'demo',
      ontologyDefined,
      riskLevel,
      requiresApproval:
        ontology?.requiresApproval ?? demo?.requiresApproval ?? (riskLevel === 'HIGH' || riskLevel === 'CRITICAL'),
      executionMode: demo?.executionMode ?? 'internal',
      targetSystem: demo?.targetSystem ?? 'No adapter',
      intentTags: ontology?.intentTags ?? demo?.intentTags ?? [],
      inputHint: ontology?.inputHint ?? demo?.inputHint,
      inputFields: demo?.inputFields ?? [],
      preconditions: demo?.preconditions ?? [],
      expectedEffects: demo?.expectedEffects ?? [],
      available: executable,
      blockingReasons,
      demoDefaults: Object.fromEntries((demo?.inputFields ?? []).flatMap((field) => field.defaultValue === undefined ? [] : [[field.key, field.defaultValue]])) as ValveJsonObject
    }
  })
}

export function normalizeActionInput(action: ValveActionDescriptor, input: ValveJsonObject = {}) {
  const normalized: ValveJsonObject = { ...action.demoDefaults, ...input }
  const blockingReasons: string[] = []
  for (const field of action.inputFields) {
    const value = normalized[field.key]
    if (field.required && (value === undefined || value === null || value === '')) {
      blockingReasons.push(`REQUIRED_INPUT_MISSING:${field.key}`)
    }
    if (field.type === 'number' && value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
      blockingReasons.push(`INVALID_NUMBER:${field.key}`)
    }
  }
  if (action.code === 'request_spare_part' && typeof normalized['quantity'] === 'number' && normalized['quantity'] <= 0) {
    blockingReasons.push('QUANTITY_MUST_BE_POSITIVE')
  }
  if (normalized['simulateMissingAsset'] === true) blockingReasons.push('EAM_ASSET_MAPPING_MISSING')
  return { normalized, blockingReasons }
}

function normalizeRisk(value?: string): ValveActionRiskLevel {
  return value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL' ? value : 'LOW'
}
