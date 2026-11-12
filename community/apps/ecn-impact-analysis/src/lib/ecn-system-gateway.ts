import { Injectable } from '@nestjs/common'
import type {
  EcnBomParentRecord,
  EcnInventoryRecord,
  EcnMaterialRecord,
  EcnProductionOrderRecord,
  EcnRoutingRecord
} from './types'

/**
 * The boundary where a real manufacturing landscape would be integrated.
 * The mock implementation below simulates a PLM (materials, BOM), an MES
 * (routings, production orders) and an ERP (inventory) with one coherent
 * product tree. Swapping this implementation for API clients is the
 * documented production path and requires no change to tools or services.
 */
export interface EcnSystemGateway {
  getMaterial(materialNo: string): Promise<EcnMaterialRecord | null>
  searchMaterials(keyword: string, limit: number): Promise<EcnMaterialRecord[]>
  searchBomParents(materialNo: string, maxDepth: number): Promise<EcnBomParentRecord[]>
  searchRoutings(materialNos: string[]): Promise<EcnRoutingRecord[]>
  searchProductionOrders(materialNos: string[]): Promise<EcnProductionOrderRecord[]>
  searchInventory(materialNos: string[]): Promise<EcnInventoryRecord[]>
}

/** Thrown once when failure simulation is enabled; retry succeeds. */
export class EcnTransientGatewayError extends Error {
  readonly code = 'gateway_transient_error'
  constructor(message: string) {
    super(message)
    this.name = 'EcnTransientGatewayError'
  }
}

const MATERIALS: EcnMaterialRecord[] = [
  { materialNo: 'EA-200', name: '电动执行器 EA-200', type: 'finished', specification: '输出扭矩 200Nm', unit: '台', designVersion: 'V2.1', status: 'released' },
  { materialNo: 'A-210', name: '减速机构总成', type: 'assembly', unit: '件', designVersion: 'V1.3', status: 'released' },
  { materialNo: 'A-220', name: '控制模块总成', type: 'assembly', unit: '件', designVersion: 'V1.2', status: 'released' },
  { materialNo: 'A-230', name: '驱动电机总成', type: 'assembly', unit: '件', designVersion: 'V1.1', status: 'released' },
  { materialNo: 'A-240', name: '连接法兰组件', type: 'assembly', unit: '件', designVersion: 'V1.0', status: 'released' },
  { materialNo: 'P-1003', name: '轴承座', type: 'component', material: 'HT200', specification: 'HT200 / 轴承孔 φ62H7', unit: '件', designVersion: 'V1.4', status: 'released' },
  { materialNo: 'P-1004', name: '蜗轮', type: 'component', material: 'QT450', unit: '件', designVersion: 'V1.2', status: 'released' },
  { materialNo: 'P-1005', name: '蜗杆轴', type: 'component', material: '45#', unit: '件', designVersion: 'V1.1', status: 'released' },
  { materialNo: 'P-1006', name: '深沟球轴承 6206', type: 'component', specification: '6206-2Z', unit: '件', status: 'released' },
  { materialNo: 'P-1007', name: '输出轴', type: 'component', material: '40Cr', unit: '件', designVersion: 'V1.0', status: 'released' },
  { materialNo: 'P-1012', name: '行星齿轮架', type: 'component', material: 'ZG310-570', unit: '件', designVersion: 'V1.1', status: 'released' },
  { materialNo: 'P-1013', name: '控制线路板', type: 'component', specification: '4 层板', unit: '块', designVersion: 'V1.6', status: 'released' },
  { materialNo: 'P-1014', name: '铝电解电容', type: 'component', specification: '450V/22μF', unit: '件', status: 'released' },
  { materialNo: 'P-1015', name: '电机转子', type: 'component', unit: '件', designVersion: 'V1.0', status: 'released' },
  { materialNo: 'P-1016', name: '电机定子', type: 'component', unit: '件', designVersion: 'V1.0', status: 'released' },
  { materialNo: 'P-1017', name: '绝对值编码器', type: 'component', specification: '17bit', unit: '件', status: 'released' },
  { materialNo: 'P-1021', name: '法兰盘', type: 'component', material: 'Q235', unit: '件', designVersion: 'V1.2', status: 'released' },
  { materialNo: 'P-1022', name: '密封圈', type: 'component', material: 'NBR', specification: 'GB/T 3452.1', unit: '件', status: 'released' },
  { materialNo: 'P-1023', name: '紧固螺栓组', type: 'component', specification: 'M8×30 8.8级', unit: '组', status: 'released' },
  { materialNo: 'R-3001', name: '轴承座铸铁毛坯', type: 'raw', material: 'HT250', unit: '件', status: 'released' },
  { materialNo: 'R-3002', name: '45# 钢棒料', type: 'raw', material: '45#', specification: 'φ80', unit: '件', status: 'released' },
  { materialNo: 'R-3003', name: '环氧树脂覆铜板', type: 'raw', specification: 'FR-4 1.6mm', unit: '张', status: 'released' },
  { materialNo: 'R-3004', name: '丁腈橡胶胶条', type: 'raw', material: 'NBR70', unit: '米', status: 'released' }
]

/** child → parent edges; depth-1 parents are direct, depth-2 via assemblies. */
const BOM_EDGES: Array<{ parent: string; child: string; quantityPer: number }> = [
  { parent: 'EA-200', child: 'A-210', quantityPer: 1 },
  { parent: 'EA-200', child: 'A-220', quantityPer: 1 },
  { parent: 'EA-200', child: 'A-230', quantityPer: 1 },
  { parent: 'EA-200', child: 'A-240', quantityPer: 1 },
  { parent: 'A-210', child: 'P-1003', quantityPer: 2 },
  { parent: 'A-210', child: 'P-1004', quantityPer: 1 },
  { parent: 'A-210', child: 'P-1005', quantityPer: 1 },
  { parent: 'A-210', child: 'P-1006', quantityPer: 4 },
  { parent: 'A-220', child: 'P-1013', quantityPer: 1 },
  { parent: 'A-220', child: 'P-1014', quantityPer: 3 },
  { parent: 'A-220', child: 'P-1017', quantityPer: 1 },
  { parent: 'A-230', child: 'P-1015', quantityPer: 1 },
  { parent: 'A-230', child: 'P-1016', quantityPer: 1 },
  { parent: 'A-230', child: 'P-1006', quantityPer: 2 },
  { parent: 'A-240', child: 'P-1021', quantityPer: 1 },
  { parent: 'A-240', child: 'P-1022', quantityPer: 2 },
  { parent: 'A-240', child: 'P-1023', quantityPer: 1 },
  { parent: 'P-1003', child: 'R-3001', quantityPer: 1 },
  { parent: 'P-1004', child: 'R-3002', quantityPer: 1 },
  { parent: 'P-1013', child: 'R-3003', quantityPer: 1 },
  { parent: 'P-1022', child: 'R-3004', quantityPer: 0.05 }
]

const ROUTINGS: EcnRoutingRecord[] = [
  {
    routingNo: 'RT-1003', routingName: '轴承座加工路线', materialNo: 'P-1003', materialName: '轴承座',
    operations: [
      { opNo: 10, opName: '粗车', workCenter: 'WC-10 车削单元' },
      { opNo: 20, opName: '镗轴承孔', workCenter: 'WC-12 镗铣单元', keyCharacteristic: '轴承孔 φ62H7，孔壁均匀性依赖毛坯硬度' },
      { opNo: 30, opName: '终检', workCenter: 'QC-01 计量室', keyCharacteristic: '材料硬度抽检（当前标准 HT200 HB170±20）' }
    ]
  },
  {
    routingNo: 'RT-1004', routingName: '蜗轮加工路线', materialNo: 'P-1004', materialName: '蜗轮',
    operations: [
      { opNo: 10, opName: '车削', workCenter: 'WC-10 车削单元' },
      { opNo: 20, opName: '滚齿', workCenter: 'WC-14 滚齿机' }
    ]
  },
  {
    routingNo: 'RT-210', routingName: '减速机构装配路线', materialNo: 'A-210', materialName: '减速机构总成',
    operations: [
      { opNo: 10, opName: '轴承压装', workCenter: 'WC-20 装配单元', keyCharacteristic: '轴承座压装过盈量' },
      { opNo: 20, opName: '啮合调整', workCenter: 'WC-20 装配单元' },
      { opNo: 30, opName: '空载试运行', workCenter: 'WC-22 测试台' }
    ]
  },
  {
    routingNo: 'RT-1013', routingName: '线路板 SMT 路线', materialNo: 'P-1013', materialName: '控制线路板',
    operations: [
      { opNo: 10, opName: '锡膏印刷', workCenter: 'WC-30 SMT 线' },
      { opNo: 20, opName: '贴片回流焊', workCenter: 'WC-30 SMT 线' },
      { opNo: 30, opName: 'AOI 检测', workCenter: 'QC-02 AOI' }
    ]
  },
  {
    routingNo: 'RT-200', routingName: 'EA-200 总装与测试路线', materialNo: 'EA-200', materialName: '电动执行器 EA-200',
    operations: [
      { opNo: 10, opName: '总装', workCenter: 'WC-40 总装线' },
      { opNo: 20, opName: '整机效率测试', workCenter: 'WC-42 测试台', keyCharacteristic: '传动效率 ≥ 88%（与减速机构强相关）' },
      { opNo: 30, opName: '老化测试', workCenter: 'WC-43 老化房' }
    ]
  },
  {
    routingNo: 'RT-1005', routingName: '蜗杆轴加工路线', materialNo: 'P-1005', materialName: '蜗杆轴',
    operations: [
      { opNo: 10, opName: '车削', workCenter: 'WC-10 车削单元' },
      { opNo: 20, opName: '磨削', workCenter: 'WC-16 磨床' }
    ]
  }
]

const PRODUCTION_ORDERS: EcnProductionOrderRecord[] = [
  { orderNo: 'MO-24001', materialNo: 'P-1003', materialName: '轴承座', quantity: 200, status: 'started', plannedStart: '2026-11-05', plannedEnd: '2026-11-18', workCenter: 'WC-10 车削单元' },
  { orderNo: 'MO-24002', materialNo: 'P-1003', materialName: '轴承座', quantity: 150, status: 'released', plannedStart: '2026-11-20', plannedEnd: '2026-11-28', workCenter: 'WC-10 车削单元' },
  { orderNo: 'MO-24003', materialNo: 'A-210', materialName: '减速机构总成', quantity: 50, status: 'started', plannedStart: '2026-11-08', plannedEnd: '2026-11-22', workCenter: 'WC-20 装配单元' },
  { orderNo: 'MO-24004', materialNo: 'EA-200', materialName: '电动执行器 EA-200', quantity: 30, status: 'released', plannedStart: '2026-11-24', plannedEnd: '2026-12-05', workCenter: 'WC-40 总装线' },
  { orderNo: 'MO-24005', materialNo: 'P-1004', materialName: '蜗轮', quantity: 300, status: 'finished_unconfirmed', plannedStart: '2026-10-28', plannedEnd: '2026-11-06', workCenter: 'WC-14 滚齿机' }
]

const INVENTORY: EcnInventoryRecord[] = [
  { materialNo: 'P-1003', materialName: '轴承座', storageLocation: 'S-01 成品库', type: 'on_hand', quantity: 400, unit: '件', batch: 'B2411', designVersion: 'V1.4' },
  { materialNo: 'P-1003', materialName: '轴承座', storageLocation: 'S-01 成品库', type: 'on_hand', quantity: 180, unit: '件', batch: 'B2412', designVersion: 'V1.4' },
  { materialNo: 'P-1003', materialName: '轴承座', storageLocation: 'S-03 待检库', type: 'quality_hold', quantity: 60, unit: '件', batch: 'B2413', designVersion: 'V1.4' },
  { materialNo: 'R-3001', materialName: '轴承座铸铁毛坯', storageLocation: 'S-02 原材料库', type: 'on_hand', quantity: 0, unit: '件', designVersion: 'V1.4' },
  { materialNo: 'R-3001', materialName: '轴承座铸铁毛坯', storageLocation: '—', type: 'in_transit', quantity: 500, unit: '件', batch: 'PO-88121' },
  { materialNo: 'R-3002', materialName: '45# 钢棒料', storageLocation: 'S-02 原材料库', type: 'on_hand', quantity: 1200, unit: '件' },
  { materialNo: 'P-1004', materialName: '蜗轮', storageLocation: 'S-01 成品库', type: 'on_hand', quantity: 350, unit: '件' },
  { materialNo: 'P-1005', materialName: '蜗杆轴', storageLocation: 'S-01 成品库', type: 'on_hand', quantity: 210, unit: '件' },
  { materialNo: 'A-210', materialName: '减速机构总成', storageLocation: 'S-04 半成品库', type: 'on_hand', quantity: 20, unit: '件', designVersion: 'V1.3' },
  { materialNo: 'A-210', materialName: '减速机构总成', storageLocation: 'S-04 半成品库', type: 'quality_hold', quantity: 8, unit: '件', batch: 'B2409' },
  { materialNo: 'EA-200', materialName: '电动执行器 EA-200', storageLocation: 'S-05 成品库', type: 'on_hand', quantity: 45, unit: '台', designVersion: 'V2.1' },
  { materialNo: 'P-1022', materialName: '密封圈', storageLocation: 'S-02 原材料库', type: 'on_hand', quantity: 800, unit: '件' }
]

/**
 * In-memory mock gateway. Dataset is code-owned so the demo works on a fresh
 * install without seeding. `failureSimulation` lets a reviewer reproduce the
 * transient-failure path deterministically: the first inventory lookup throws,
 * the retry succeeds.
 */
@Injectable()
export class MockEcnSystemGateway implements EcnSystemGateway {
  private inventoryFailureArmed = false

  setFailureSimulation(enabled: boolean): void {
    this.inventoryFailureArmed = enabled
  }

  async getMaterial(materialNo: string): Promise<EcnMaterialRecord | null> {
    return MATERIALS.find((m) => m.materialNo === materialNo) ?? null
  }

  async searchMaterials(keyword: string, limit: number): Promise<EcnMaterialRecord[]> {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return []
    return MATERIALS.filter(
      (m) => m.materialNo.toLowerCase().includes(normalized) || m.name.toLowerCase().includes(normalized)
    ).slice(0, limit)
  }

  async searchBomParents(materialNo: string, maxDepth: number): Promise<EcnBomParentRecord[]> {
    const parents: EcnBomParentRecord[] = []
    const material = MATERIALS.find((m) => m.materialNo === materialNo)
    const walk = (childNo: string, depth: number, path: string[]) => {
      if (depth > maxDepth) return
      for (const edge of BOM_EDGES.filter((e) => e.child === childNo)) {
        const parent = MATERIALS.find((m) => m.materialNo === edge.parent)
        if (!parent) continue
        parents.push({
          parentNo: parent.materialNo,
          parentName: parent.name,
          quantityPer: edge.quantityPer,
          depth,
          relationPath: [...path, parent.materialNo].join(' > '),
          parentType: parent.type
        })
        walk(parent.materialNo, depth + 1, [...path, parent.materialNo])
      }
    }
    walk(materialNo, 1, [materialNo])
    return parents
  }

  async searchRoutings(materialNos: string[]): Promise<EcnRoutingRecord[]> {
    const wanted = new Set(materialNos)
    return ROUTINGS.filter((r) => wanted.has(r.materialNo))
  }

  async searchProductionOrders(materialNos: string[]): Promise<EcnProductionOrderRecord[]> {
    const wanted = new Set(materialNos)
    return PRODUCTION_ORDERS.filter((o) => wanted.has(o.materialNo))
  }

  async searchInventory(materialNos: string[]): Promise<EcnInventoryRecord[]> {
    if (this.inventoryFailureArmed) {
      this.inventoryFailureArmed = false
      throw new EcnTransientGatewayError('ERP 库存接口连接超时（模拟的瞬态故障，重试即可恢复）')
    }
    const wanted = new Set(materialNos)
    return INVENTORY.filter((i) => wanted.has(i.materialNo))
  }
}
