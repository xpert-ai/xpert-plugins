/**
 * 缺料计算：纯函数，不依赖数据库、不依赖 NestJS，输入输出都是普通对象。
 *
 * 缺口 = 需求量 − 库存 − 目标交期前（含当天）到货的在途。
 * 这是确定性的加减法，由服务端算，模型只基于这些数字做判断和建议（产品设计决策 3）。
 * Python 类比：calculator.py 里的几个纯函数，pytest 直接断言返回值。
 */
import type { InboundOrder, InventoryRow, IsoDate, Material, Product } from './supply/supply-types.js'

/** 某物料在 BOM 中的一处用法（用于展示依据：X1 → K-20 → P-201 ×1） */
export interface BomUsage {
  componentCode: string
  componentName: string
  /** 每台成品的用量 = 部件数 × 部件内单耗 */
  qtyPerProduct: number
}

export interface RequirementLine {
  materialCode: string
  materialName: string
  unit: string
  /** 每台成品合计用量（多处用法已合并） */
  qtyPerProduct: number
  requiredQty: number
  usages: BomUsage[]
}

export interface AvailabilityLine extends RequirementLine {
  onHand: number
  /** 目标交期前（含当天）到货的在途，计入可用量 */
  inboundInWindow: InboundOrder[]
  /** 目标交期之后才到的在途，不计入可用量，但可作为催料对象 */
  inboundLate: InboundOrder[]
  availableQty: number
  shortageQty: number
}

/** 两层 BOM 展开；同一物料在多个部件下出现时合并为一行，保持首次出现的顺序 */
export function explodeBom(
  product: Product,
  quantity: number,
  findMaterial: (code: string) => Material | undefined
): RequirementLine[] {
  const lines = new Map<string, RequirementLine>()
  for (const component of product.components) {
    for (const item of component.items) {
      const material = findMaterial(item.materialCode)
      if (!material) throw new Error(`Unknown material in BOM: ${item.materialCode}`)
      const qtyPerProduct = component.qtyPer * item.qtyPer
      const usage: BomUsage = { componentCode: component.code, componentName: component.name, qtyPerProduct }
      const existing = lines.get(material.code)
      if (existing) {
        existing.qtyPerProduct += qtyPerProduct
        existing.requiredQty = existing.qtyPerProduct * quantity
        existing.usages.push(usage)
      } else {
        lines.set(material.code, {
          materialCode: material.code,
          materialName: material.name,
          unit: material.unit,
          qtyPerProduct,
          requiredQty: qtyPerProduct * quantity,
          usages: [usage]
        })
      }
    }
  }
  return [...lines.values()]
}

/** 按目标交期计算每个物料的可用量和缺口 */
export function computeAvailability(
  requirements: readonly RequirementLine[],
  inventory: readonly InventoryRow[],
  inbound: readonly InboundOrder[],
  targetDate: IsoDate
): AvailabilityLine[] {
  return requirements.map((line) => {
    const onHand = inventory.find((row) => row.materialCode === line.materialCode)?.onHand ?? 0
    const orders = sortByEta(inbound.filter((order) => order.materialCode === line.materialCode))
    // ISO 日期字符串可以直接按字典序比较大小
    const inboundInWindow = orders.filter((order) => order.eta <= targetDate)
    const inboundLate = orders.filter((order) => order.eta > targetDate)
    const availableQty = onHand + sum(inboundInWindow.map((order) => order.qty))
    return {
      ...line,
      usages: line.usages.map((usage) => ({ ...usage })),
      onHand,
      inboundInWindow,
      inboundLate,
      availableQty,
      shortageQty: Math.max(0, line.requiredQty - availableQty)
    }
  })
}

/**
 * 物料最早可满足需求的日期：
 * - 现有在途按到货日累加，库存 + 已到在途 ≥ 需求量的那一天；
 * - 或者今天重新下单，基准日 + 采购提前期；
 * 两者取较早的。库存本身就够时返回基准日。
 */
export function earliestAvailableDate(
  requiredQty: number,
  onHand: number,
  inbound: readonly InboundOrder[],
  leadTimeDays: number,
  asOfDate: IsoDate
): IsoDate {
  if (onHand >= requiredQty) return asOfDate
  const reorderDate = addDays(asOfDate, leadTimeDays)
  let cumulative = onHand
  for (const order of sortByEta(inbound)) {
    cumulative += order.qty
    if (cumulative >= requiredQty) return order.eta < reorderDate ? order.eta : reorderDate
  }
  return reorderDate
}

/** 在 'YYYY-MM-DD' 上加天数（按 UTC 计算，避免本地时区导致差一天） */
export function addDays(date: IsoDate, days: number): IsoDate {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function sortByEta(orders: readonly InboundOrder[]): InboundOrder[] {
  return [...orders].sort((a, b) => a.eta.localeCompare(b.eta) || a.poNo.localeCompare(b.poNo)).map((order) => ({ ...order }))
}

function sum(values: readonly number[]) {
  return values.reduce((total, value) => total + value, 0)
}
