/**
 * 主数据（产品、BOM、库存、在途、提前期、替代料）的类型定义。
 * 主数据在本流程里只读；业务数据（请求、任务、结论）另存数据库表。
 * Python 类比：一组 TypedDict / dataclass(frozen=True)。
 */

/** 日期统一用 'YYYY-MM-DD' 字符串，避免时区问题 */
export type IsoDate = string

export interface Material {
  code: string
  name: string
  unit: string
}

/** BOM 第二层：部件下的外购件 */
export interface BomItem {
  materialCode: string
  /** 每 1 个部件需要的数量 */
  qtyPer: number
}

/** BOM 第一层：成品下的部件 */
export interface BomComponent {
  code: string
  name: string
  /** 每 1 台成品需要的部件数量 */
  qtyPer: number
  items: readonly BomItem[]
}

export interface Product {
  code: string
  name: string
  components: readonly BomComponent[]
}

export interface InventoryRow {
  materialCode: string
  onHand: number
}

/** 采购在途：已下单未到货 */
export interface InboundOrder {
  poNo: string
  materialCode: string
  qty: number
  eta: IsoDate
}

export interface SubstituteOption {
  materialCode: string
  substituteCode: string
  note: string
}

export interface SupplyParameter {
  materialCode: string
  /** 重新采购的提前期（天） */
  leadTimeDays: number
}
