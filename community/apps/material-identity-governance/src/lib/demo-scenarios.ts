import { sourceSnapshotHash as hashSource } from './source-snapshot.js'
import { createMockDrawing } from './mock-drawings.js'
import type {
  Attribute,
  CaseKind,
  Evidence,
  GovernanceCase,
  SourceMaterial,
} from './contracts.js'
const timestamp = '2026-09-05T01:00:00.000Z'
const titles: Record<CaseKind, string> = {
  duplicate_codes: '轮毂轴承跨工厂重复编码治理',
  code_collision: '电池托架同码异物冲突治理',
  drawing_request: '转向电机隔套图纸新增防重',
}
function attr(
  key: string,
  label: string,
  value: string,
  unit: string | null = null,
): Attribute {
  return {
    key,
    label,
    value,
    unit,
    critical: true,
    evidenceIds: [`evidence-${key}`],
  }
}
function material(
  partial: Partial<SourceMaterial> &
    Pick<SourceMaterial, 'id' | 'code' | 'name' | 'attributes'>,
): SourceMaterial {
  return {
    system: 'ERP',
    plant: '苏州工厂',
    category: 'automotive-part',
    drawing: '',
    revision: 'A',
    supplier: '华辰汽车零部件',
    quantity: 0,
    unitCost: 0,
    ...partial,
  }
}
export function createDemoCase(
  kind: CaseKind,
  id: string,
  title?: string,
  now = timestamp,
): GovernanceCase {
  let materials: SourceMaterial[]
  if (kind === 'duplicate_codes') {
    const attributes = [
      attr('material', '材质', 'GCr15'),
      attr('bore', '内径', '20', 'mm'),
      attr('outer', '外径', '47', 'mm'),
      attr('width', '宽度', '14', 'mm'),
      attr('precision', '精度', 'P6'),
      attr('seal', '密封', '2RS'),
    ]
    materials = [
      material({
        id: 'sz-bearing',
        code: 'SZ-BRG-6204-02',
        name: '深沟球轴承 6204-2RS/P6',
        category: 'bearing',
        drawing: 'BRG-6204-2RS',
        attributes,
        quantity: 2400,
        unitCost: 28.5,
        supplier: '苏州精工轴承',
      }),
      material({
        id: 'cq-bearing',
        code: 'CQ-1004582',
        name: '轴承 6204 双面密封 P6',
        plant: '重庆工厂',
        category: 'bearing',
        drawing: 'BRG-6204-2RS',
        attributes: attributes.map((a) =>
          a.key === 'bore' ? { ...a, value: '0.020', unit: 'm' } : { ...a },
        ),
        quantity: 1800,
        unitCost: 29,
        supplier: '渝东动力配套',
      }),
    ]
  } else if (kind === 'code_collision') {
    materials = [
      material({
        id: 'bracket-steel',
        code: 'MT-BR-001268',
        name: '电池包固定托架',
        category: 'bracket',
        drawing: 'BAT-BR-101',
        attributes: [
          attr('material', '材质', 'DC01'),
          attr('thickness', '板厚', '3', 'mm'),
          attr('hole', '安装孔径', '8.5', 'mm'),
        ],
        quantity: 760,
        unitCost: 42,
      }),
      material({
        id: 'bracket-stainless',
        code: 'MT-BR-001268',
        name: '电池包固定托架',
        plant: '重庆工厂',
        category: 'bracket',
        drawing: 'BAT-BR-208',
        revision: 'B',
        attributes: [
          attr('material', '材质', 'SUS304'),
          attr('thickness', '板厚', '5', 'mm'),
          attr('hole', '安装孔径', '10.5', 'mm'),
        ],
        quantity: 420,
        unitCost: 69,
      }),
    ]
  } else {
    const attributes = [
      attr('material', '材质', '20CrMnTi'),
      attr('bore', '内径', '20', 'mm'),
      attr('outer', '外径', '32', 'mm'),
      attr('length', '长度', '40', 'mm'),
      attr('hardness', '表面硬度', '58-62 HRC'),
    ]
    materials = [
      material({
        id: 'plm-spacer',
        code: 'REQ-RD-260905-17',
        name: '转向电机精密隔套新建申请',
        system: 'PLM',
        plant: '研发设计中心',
        category: 'spacer',
        drawing: 'STR-SP-2040',
        revision: 'C',
        attributes,
        quantity: 0,
        unitCost: 18.6,
      }),
      material({
        id: 'erp-spacer',
        code: 'MAT-SP-000842',
        name: '隔套 20×32×40 渗碳淬火',
        category: 'spacer',
        drawing: 'STR-SP-2040',
        revision: 'C',
        attributes: attributes.map((a) => ({ ...a })),
        quantity: 3600,
        unitCost: 18.6,
      }),
    ]
  }
  const evidence: Evidence[] = materials.flatMap((m, index) => [
    ...m.attributes.map((a) => ({
      id: `${m.id}-${a.key}`,
      system: m.system,
      reference: `${m.system}/${m.code}/rev-${m.revision}`,
      field: a.label,
      value: `${a.value}${a.unit ?? ''}`,
      excerpt: `${m.plant} ${m.name}：${a.label}标注 ${a.value}${a.unit ?? ''}。`,
      observedAt: now,
      ...(m.system === 'PLM' ? { page: 1 } : {}),
    })),
    {
      id: `${m.id}-drawing`,
      system: 'PLM',
      reference: `PLM/${m.drawing}/${m.revision}`,
      field: '图号与版本',
      value: `${m.drawing}/${m.revision}`,
      excerpt: `已发布图纸 ${m.drawing}，版本 ${m.revision}，来源研发设计部门。`,
      observedAt: now,
      page: 1,
    },
    {
      id: `${m.id}-lot`,
      system: 'WMS',
      reference: `LOT-260905-${index + 1}`,
      field: '批次库存',
      value: String(m.quantity),
      excerpt: `${m.plant}当前库存 ${m.quantity} 件，历史批次保留原编码追溯。`,
      observedAt: now,
    },
  ])
  materials = materials.map((m) => ({
    ...m,
    attributes: m.attributes.map((a) => ({
      ...a,
      evidenceIds: [`${m.id}-${a.key}`],
    })),
  }))
  const drawings = materials.map(createMockDrawing),
    sourceSnapshotHash = hashSource({ materials, evidence, drawings })
  return {
    drawings,
    sourceSnapshotHash,
    id,
    caseKey: `MIG-${kind === 'duplicate_codes' ? 'DUP' : kind === 'code_collision' ? 'COL' : 'RD'}-${id.slice(-6).toUpperCase()}`,
    title: title || titles[kind],
    kind,
    status: 'open',
    revision: 1,
    templateKey: 'material_identity_governance',
    templateVersion: 1,
    createdAt: now,
    updatedAt: now,
    materials,
    evidence,
    candidates: [],
    impacts: [],
    artifacts: [],
    criticalConflict: null,
    proposal: null,
    approval: null,
    publications: [],
    mockMode: true,
  }
}
