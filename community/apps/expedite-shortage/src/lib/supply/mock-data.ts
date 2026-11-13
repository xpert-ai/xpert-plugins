/**
 * 模拟主数据（非真实企业数据）。
 *
 * 场景：一家做电机控制柜的工厂，两个成品 X1、X2，BOM 两层（成品 → 部件 → 外购件）。
 * 基准日固定为 2026-11-12，保证单测和截图在任何时间、任何机器上都得到同样的数字。
 *
 * 三条演示请求的预期结论（单测会断言）：
 * - SO-1024：X1 × 50，目标 11-25 → P-201、B-110 缺料，有条件可行
 * - SO-1031：X2 × 20，目标 11-28 → S-211 缺料且提前期 20 天，不可行（最早 12-02）
 * - SO-1040：X1 × 10，目标 11-27 → 不缺料
 */
import type {
  BomComponent,
  InboundOrder,
  InventoryRow,
  IsoDate,
  Material,
  Product,
  SubstituteOption,
  SupplyParameter
} from './supply-types.js'

export const MOCK_AS_OF_DATE: IsoDate = '2026-11-12'

/** 库存快照时间（展示用，写进结论依据里） */
export const MOCK_INVENTORY_SNAPSHOT_AT = '2026-11-12T09:00:00+08:00'

export const MOCK_MATERIALS: readonly Material[] = [
  { code: 'M-101', name: '柜体钣金', unit: '件' },
  { code: 'M-102', name: '安装底板', unit: '件' },
  { code: 'F-103', name: '散热风扇', unit: '个' },
  { code: 'F-103A', name: '散热风扇（替代型号）', unit: '个' },
  { code: 'P-201', name: 'PLC 主控模块', unit: '个' },
  { code: 'P-202', name: 'IO 扩展模块', unit: '个' },
  { code: 'H-203', name: '7 寸触摸屏', unit: '个' },
  { code: 'H-203A', name: '7 寸触摸屏（替代型号）', unit: '个' },
  { code: 'B-110', name: '微型断路器 3P 32A', unit: '个' },
  { code: 'B-110A', name: '微型断路器 3P 32A（替代品牌）', unit: '个' },
  { code: 'C-301', name: '交流接触器', unit: '个' },
  { code: 'T-302', name: '控制变压器', unit: '个' },
  { code: 'W-401', name: '电缆组件', unit: '套' },
  { code: 'W-402', name: '接线端子排', unit: '条' },
  { code: 'S-211', name: '伺服驱动器 1.5kW', unit: '个' },
  { code: 'H-310', name: '10 寸触摸屏', unit: '个' }
]

const CABINET: BomComponent = {
  code: 'K-10',
  name: '柜体组件',
  qtyPer: 1,
  items: [
    { materialCode: 'M-101', qtyPer: 1 },
    { materialCode: 'M-102', qtyPer: 1 },
    { materialCode: 'F-103', qtyPer: 2 }
  ]
}

const POWER: BomComponent = {
  code: 'K-30',
  name: '配电组件',
  qtyPer: 1,
  items: [
    { materialCode: 'B-110', qtyPer: 2 },
    { materialCode: 'C-301', qtyPer: 3 },
    { materialCode: 'T-302', qtyPer: 1 },
    { materialCode: 'W-402', qtyPer: 4 }
  ]
}

const HARNESS: BomComponent = {
  code: 'K-40',
  name: '线束组件',
  qtyPer: 1,
  items: [
    { materialCode: 'W-401', qtyPer: 4 },
    // 端子排同时出现在配电组件和线束组件下，展开时要合并
    { materialCode: 'W-402', qtyPer: 6 }
  ]
}


export const MOCK_PRODUCTS: readonly Product[] = [
  {
    code: 'X1',
    name: '控制柜 X1',
    components: [
      CABINET,
      {
        code: 'K-20',
        name: '控制组件',
        qtyPer: 1,
        items: [
          { materialCode: 'P-201', qtyPer: 1 },
          { materialCode: 'P-202', qtyPer: 2 },
          { materialCode: 'H-203', qtyPer: 1 }
        ]
      },
      POWER,
      HARNESS
    ]
  },
  {
    code: 'X2',
    name: '控制柜 X2',
    components: [
      CABINET,
      {
        code: 'K-21',
        name: '伺服控制组件',
        qtyPer: 1,
        items: [
          { materialCode: 'P-201', qtyPer: 1 },
          { materialCode: 'S-211', qtyPer: 2 },
          { materialCode: 'H-310', qtyPer: 1 }
        ]
      },
      POWER,
      HARNESS
    ]
  }
]

export const MOCK_INVENTORY: readonly InventoryRow[] = [
  { materialCode: 'M-101', onHand: 60 },
  { materialCode: 'M-102', onHand: 75 },
  { materialCode: 'F-103', onHand: 160 },
  { materialCode: 'F-103A', onHand: 40 },
  { materialCode: 'P-201', onHand: 30 },
  { materialCode: 'P-202', onHand: 150 },
  { materialCode: 'H-203', onHand: 70 },
  { materialCode: 'H-203A', onHand: 20 },
  { materialCode: 'B-110', onHand: 60 },
  { materialCode: 'B-110A', onHand: 80 },
  { materialCode: 'C-301', onHand: 300 },
  { materialCode: 'T-302', onHand: 80 },
  { materialCode: 'W-401', onHand: 500 },
  { materialCode: 'W-402', onHand: 800 },
  { materialCode: 'S-211', onHand: 10 },
  { materialCode: 'H-310', onHand: 35 }
]

export const MOCK_INBOUND: readonly InboundOrder[] = [
  // P-201：在途 20 个，但 12-02 才到，赶不上 11-25
  { poNo: 'PO-778', materialCode: 'P-201', qty: 20, eta: '2026-12-02' },
  // B-110：在途 40 个，12-03 到
  { poNo: 'PO-790', materialCode: 'B-110', qty: 40, eta: '2026-12-03' },
  // S-211：在途 10 个，11-20 到，能赶上 11-28，但仍不够
  { poNo: 'PO-812', materialCode: 'S-211', qty: 10, eta: '2026-11-20' },
  { poNo: 'PO-820', materialCode: 'C-301', qty: 100, eta: '2026-11-18' }
]

export const MOCK_SUPPLY_PARAMETERS: readonly SupplyParameter[] = [
  { materialCode: 'M-101', leadTimeDays: 10 },
  { materialCode: 'M-102', leadTimeDays: 10 },
  { materialCode: 'F-103', leadTimeDays: 7 },
  { materialCode: 'F-103A', leadTimeDays: 7 },
  { materialCode: 'P-201', leadTimeDays: 25 },
  { materialCode: 'P-202', leadTimeDays: 14 },
  { materialCode: 'H-203', leadTimeDays: 12 },
  { materialCode: 'H-203A', leadTimeDays: 12 },
  { materialCode: 'B-110', leadTimeDays: 30 },
  { materialCode: 'B-110A', leadTimeDays: 10 },
  { materialCode: 'C-301', leadTimeDays: 10 },
  { materialCode: 'T-302', leadTimeDays: 15 },
  { materialCode: 'W-401', leadTimeDays: 5 },
  { materialCode: 'W-402', leadTimeDays: 5 },
  { materialCode: 'S-211', leadTimeDays: 20 },
  { materialCode: 'H-310', leadTimeDays: 18 }
]

export const MOCK_SUBSTITUTES: readonly SubstituteOption[] = [
  { materialCode: 'B-110', substituteCode: 'B-110A', note: '同规格替代品牌，已通过电气认证，切换需质量部确认' },
  { materialCode: 'H-203', substituteCode: 'H-203A', note: '安装尺寸一致，需更新 HMI 程序版本' },
  { materialCode: 'F-103', substituteCode: 'F-103A', note: '风量略低 5%，夏季高温工况慎用' }
]

/** 三条演示请求（业务数据，由界面“载入演示请求”按钮写入数据库） */
export interface DemoRequestSeed {
  orderNo: string
  customerName: string
  productCode: string
  quantity: number
  originalDueDate: IsoDate
  targetDate: IsoDate
  remark: string
  demoFailInventoryOnce: boolean
}

export const DEMO_REQUESTS: readonly DemoRequestSeed[] = [
  {
    orderNo: 'SO-1024',
    customerName: '恒远包装机械',
    productCode: 'X1',
    quantity: 50,
    originalDueDate: '2026-12-05',
    targetDate: '2026-11-25',
    remark: '客户月底盘点，希望提前到货',
    demoFailInventoryOnce: false
  },
  {
    orderNo: 'SO-1031',
    customerName: '联创物流装备',
    productCode: 'X2',
    quantity: 20,
    originalDueDate: '2026-12-10',
    targetDate: '2026-11-28',
    remark: '新产线调试提前，演示：第一次分析模拟库存系统故障',
    demoFailInventoryOnce: true
  },
  {
    orderNo: 'SO-1040',
    customerName: '顺达食品机械',
    productCode: 'X1',
    quantity: 10,
    originalDueDate: '2026-12-01',
    targetDate: '2026-11-27',
    remark: '小批量补单',
    demoFailInventoryOnce: false
  }
]
