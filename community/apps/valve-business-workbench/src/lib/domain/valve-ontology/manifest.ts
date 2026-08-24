import type {
  ValveOntologyActionTypeDefinition,
  ValveOntologyAttributeDefinition,
  ValveOntologyAttributeType,
  ValveOntologyCardinality,
  ValveOntologyManifest,
  ValveOntologyRelationTypeDefinition,
  ValveOntologyRiskLevel
} from './types'

export const VALVE_ONTOLOGY_DEFINITION_ID = 'valve.engineering'
export const VALVE_ONTOLOGY_RESOURCE_ID = 'valve-engineering-ontology'
export const VALVE_ONTOLOGY_BASE_IRI = 'https://xpert.ai/ontology/valve/engineering/1.0#'
export const VALVE_ONTOLOGY_DEFINITION_NAME = 'Valve Engineering Ontology'
export const VALVE_ONTOLOGY_DEFINITION_DESCRIPTION =
  '阀门业务工作台维护的阀门工程本体，描述阀门、部件、材料、执行机构、标准、受控 Actions 和一组中性的产品演示数据。'

function attribute(
  code: string,
  name: string,
  valueType: ValveOntologyAttributeType,
  required = false,
  description?: string
): ValveOntologyAttributeDefinition {
  return { code, name, valueType, required, repeated: false, ...(description ? { description } : {}) }
}

function relation(
  code: string,
  name: string,
  sourceEntityTypeCode: string,
  targetEntityTypeCode: string,
  cardinality: ValveOntologyCardinality,
  description: string
): ValveOntologyRelationTypeDefinition {
  return { code, name, sourceEntityTypeCode, targetEntityTypeCode, cardinality, description, attributes: [] }
}

function action(
  code: string,
  name: string,
  description: string,
  riskLevel: ValveOntologyRiskLevel,
  intentTags: string[],
  inputHint: string,
  required: string[],
  properties: Record<string, unknown>,
  effectTarget: string
): ValveOntologyActionTypeDefinition {
  return {
    code,
    name,
    description,
    targetEntityTypeCodes: ['valve'],
    attributes: [],
    riskLevel,
    requiresApproval: true,
    discoveryMode: 'suggestable',
    intentTags,
    preconditions: ['目标阀门必须来自当前已发布快照', '执行前必须由用户审核动作草案'],
    inputHint,
    inputSchema: { required, properties },
    effects: [{ type: code === 'request_engineering_review' || code === 'isolate_valve' ? 'analysis' : 'external_call', target: effectTarget }],
    idempotencyRequired: true,
    expectedEffectRequired: true
  }
}

const stringInput = (description: string) => ({ type: 'string', description })
const numberInput = (description: string) => ({ type: 'number', description })

export const VALVE_ONTOLOGY_MANIFEST: ValveOntologyManifest = {
  adapterId: VALVE_ONTOLOGY_DEFINITION_ID,
  version: {
    semanticVersion: '1.0.0',
    notes:
      'Initial valve engineering ontology for the Valve Business Workbench, including governed Action contracts and neutral demonstration instances.'
  },
  entityTypes: [
    {
      code: 'valve',
      name: '阀门',
      description: '用于控制、切断或调节流体流动的工程设备。',
      icon: '🔧',
      color: '#0f766e',
      defaultStateCode: 'active',
      attributes: [
        attribute('size', '尺寸', 'string', true),
        attribute('valve_type', '阀门类型', 'string', true),
        attribute('pressure_rating', '压力等级', 'string', true),
        attribute('design_pressure', '设计压力', 'number'),
        attribute('design_temperature', '设计温度', 'number'),
        attribute('face_to_face_length', '结构长度', 'number'),
        attribute('flow_coefficient_cv', '流量系数（Cv）', 'number'),
        attribute('is_fire_safe', '是否防火安全', 'boolean'),
        attribute('manufacturer', '制造商', 'string'),
        attribute('model', '型号', 'string'),
        attribute('service', '介质/工况', 'string')
      ]
    },
    {
      code: 'valve_component',
      name: '阀门部件',
      description: '阀体、阀座、阀杆、密封件等组成部件。',
      icon: '🧩',
      color: '#2563eb',
      defaultStateCode: 'active',
      attributes: [
        attribute('component_type', '部件类型', 'string', true),
        attribute('material_grade', '材料牌号', 'string'),
        attribute('drawing_reference', '图纸引用', 'string'),
        attribute('criticality', '关键度', 'string')
      ]
    },
    {
      code: 'actuator',
      name: '执行机构',
      description: '驱动阀门开闭或调节的执行机构。',
      icon: '⚡',
      color: '#ea580c',
      defaultStateCode: 'active',
      attributes: [
        attribute('actuator_type', '执行机构类型', 'string', true),
        attribute('fail_position', '故障位', 'string'),
        attribute('torque_nm', '输出扭矩（Nm）', 'number'),
        attribute('power_supply', '电源', 'string')
      ]
    },
    {
      code: 'material',
      name: '材料',
      description: '阀门及其部件使用的工程材料。',
      icon: '🧱',
      color: '#7c3aed',
      defaultStateCode: 'active',
      attributes: [
        attribute('grade', '材料牌号', 'string', true),
        attribute('specification', '材料规范', 'string'),
        attribute('material_type', '材料类型', 'string')
      ]
    },
    {
      code: 'standard',
      name: '标准',
      description: '阀门设计、制造、检验和验收所遵循的标准。',
      icon: '📋',
      color: '#0891b2',
      defaultStateCode: 'active',
      attributes: [
        attribute('standard_code', '标准编号', 'string', true),
        attribute('title', '标准名称', 'string', true),
        attribute('edition', '版本', 'string'),
        attribute('issuing_body', '发布机构', 'string')
      ]
    }
  ],
  relationTypes: [
    relation('has_part', '包含部件', 'valve', 'valve_component', 'one_to_many', '阀门由一个或多个工程部件组成。'),
    relation('has_material', '使用材料', 'valve_component', 'material', 'many_to_one', '部件采用指定材料制造。'),
    relation('driven_by', '由执行机构驱动', 'valve', 'actuator', 'many_to_one', '阀门由执行机构驱动。'),
    relation('complies_with', '符合标准', 'valve', 'standard', 'many_to_many', '阀门设计与制造符合相关标准。')
  ],
  actionTypes: [
    action(
      'create_maintenance_work_order',
      '创建阀门维护工单',
      '基于阀门对象、约束和证据创建待派工维护工单草案。',
      'HIGH',
      ['maintenance', 'work-order'],
      '提供故障现象、优先级和期望完成日期。',
      ['problem', 'priority', 'dueDate'],
      { problem: stringInput('故障现象'), priority: stringInput('优先级'), dueDate: stringInput('期望完成日期') },
      'eam.maintenance_work_order'
    ),
    action(
      'schedule_valve_inspection',
      '安排阀门专项巡检',
      '为当前阀门安排带日期和检查范围的巡检任务。',
      'MEDIUM',
      ['inspection', 'schedule'],
      '提供巡检类型、计划日期和检查范围。',
      ['inspectionType', 'scheduledDate', 'scope'],
      { inspectionType: stringInput('巡检类型'), scheduledDate: stringInput('计划日期'), scope: stringInput('检查范围') },
      'inspection.task'
    ),
    action(
      'raise_quality_deviation',
      '发起质量偏差',
      '针对标准、材料或检验结果不一致创建质量偏差草案。',
      'HIGH',
      ['quality', 'deviation'],
      '提供偏差描述、所涉标准和处置建议。',
      ['deviation', 'standard', 'disposition'],
      { deviation: stringInput('偏差描述'), standard: stringInput('所涉标准'), disposition: stringInput('处置建议') },
      'qms.quality_deviation'
    ),
    action(
      'request_spare_part',
      '申请阀门备件',
      '根据关联部件和维护需求创建备件申请草案。',
      'MEDIUM',
      ['spare-part', 'procurement'],
      '提供部件、数量和需求日期。',
      ['component', 'quantity', 'requiredDate'],
      { component: stringInput('备件/部件'), quantity: numberInput('数量'), requiredDate: stringInput('需求日期') },
      'procurement.spare_part_request'
    ),
    action(
      'request_valve_replacement',
      '申请阀门更换评审',
      '创建阀门整机更换工程评审任务，不直接执行采购或现场更换。',
      'HIGH',
      ['replacement', 'engineering-review'],
      '提供更换原因、计划窗口和工程依据。',
      ['reason', 'window', 'basis'],
      { reason: stringInput('更换原因'), window: stringInput('计划窗口'), basis: stringInput('工程依据') },
      'engineering.valve_replacement_review'
    ),
    action(
      'isolate_valve',
      '模拟阀门隔离',
      '生成隔离影响模拟与操作票草案；不得向 DCS/SIS 发送控制命令。',
      'CRITICAL',
      ['isolation', 'safety', 'simulation'],
      '提供隔离原因和许可编号。',
      ['reason', 'permit'],
      { reason: stringInput('隔离原因'), permit: stringInput('许可编号') },
      'simulation.valve_isolation'
    ),
    action(
      'request_engineering_review',
      '请求工程复核',
      '为当前阀门创建内部工程复核任务。',
      'LOW',
      ['review'],
      '提供复核问题和专业。',
      ['question', 'discipline'],
      { question: stringInput('复核问题'), discipline: stringInput('专业') },
      'engineering.review'
    )
  ],
  states: [{ code: 'active', name: '在用', description: '当前有效并可用于工程分析。' }],
  rules: [],
  metrics: [],
  policies: []
}
