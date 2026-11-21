/**
 * 供应数据源接口：计算和工具只依赖这个抽象类，不直接读常量。
 * 第一版实现是 MockSupplyDataSource；将来接 ERP 只需再写一个实现，并在模块里换一行注册。
 *
 * 为什么用 abstract class 而不是 interface：TypeScript 的 interface 编译后不存在，
 * NestJS 依赖注入需要一个运行时还在的“令牌”，抽象类正好可以当令牌。
 * Python 类比：class SupplyDataSource(abc.ABC)，方法都用 @abstractmethod。
 */
import type {
  InboundOrder,
  InventoryRow,
  IsoDate,
  Material,
  Product,
  SubstituteOption,
  SupplyParameter
} from './supply-types.js'

/** 一次库存查询的上下文：由 Service 计算后传入 */
export interface SupplyCallContext {
  /** 为 true 时模拟“库存系统不可用”（演示故障开关 + 第 1 个分析任务） */
  simulateInventoryOutage: boolean
}

/** 库存与在途的一次快照 */
export interface InventoryPosition {
  snapshotAt: string
  inventory: InventoryRow[]
  inbound: InboundOrder[]
}

/** 外部供应系统不可用时抛出的业务错误，code 是稳定错误码 */
export class SupplyUnavailableError extends Error {
  constructor(readonly code: 'INVENTORY_UNAVAILABLE') {
    super(code)
    this.name = 'SupplyUnavailableError'
  }
}

export abstract class SupplyDataSource {
  /** 基准日：所有“今天”都取它，保证结果可复现 */
  abstract getAsOfDate(): IsoDate
  abstract listProducts(): readonly Product[]
  abstract getProduct(productCode: string): Product | undefined
  abstract getMaterial(materialCode: string): Material | undefined
  /** 库存与在途（演示故障点，所以是异步、可能抛 SupplyUnavailableError） */
  abstract getInventoryPosition(materialCodes: readonly string[], ctx: SupplyCallContext): Promise<InventoryPosition>
  abstract getSupplyParameters(materialCodes: readonly string[]): SupplyParameter[]
  abstract getSubstitutes(materialCodes: readonly string[]): SubstituteOption[]
}
