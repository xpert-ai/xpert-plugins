/**
 * 供应数据源的模拟实现：数据来自 mock-data.ts 里的常量。
 * “模拟库存系统故障”也放在这里：调用方传入 simulateInventoryOutage=true 时抛出业务错误。
 */
import { Injectable } from '@nestjs/common'
import {
  MOCK_AS_OF_DATE,
  MOCK_INBOUND,
  MOCK_INVENTORY,
  MOCK_INVENTORY_SNAPSHOT_AT,
  MOCK_MATERIALS,
  MOCK_PRODUCTS,
  MOCK_SUBSTITUTES,
  MOCK_SUPPLY_PARAMETERS
} from './mock-data.js'
import { SupplyDataSource, SupplyUnavailableError } from './supply-data-source.js'
import type { InventoryPosition, SupplyCallContext } from './supply-data-source.js'
import type { Material, Product, SubstituteOption, SupplyParameter } from './supply-types.js'

@Injectable()
export class MockSupplyDataSource extends SupplyDataSource {
  getAsOfDate() {
    return MOCK_AS_OF_DATE
  }

  listProducts(): readonly Product[] {
    return MOCK_PRODUCTS
  }

  getProduct(productCode: string): Product | undefined {
    return MOCK_PRODUCTS.find((product) => product.code === productCode)
  }

  getMaterial(materialCode: string): Material | undefined {
    return MOCK_MATERIALS.find((material) => material.code === materialCode)
  }

  async getInventoryPosition(materialCodes: readonly string[], ctx: SupplyCallContext): Promise<InventoryPosition> {
    if (ctx.simulateInventoryOutage) throw new SupplyUnavailableError('INVENTORY_UNAVAILABLE')
    const codes = new Set(materialCodes)
    return {
      snapshotAt: MOCK_INVENTORY_SNAPSHOT_AT,
      // 返回副本，防止调用方改动常量
      inventory: MOCK_INVENTORY.filter((row) => codes.has(row.materialCode)).map((row) => ({ ...row })),
      inbound: MOCK_INBOUND.filter((row) => codes.has(row.materialCode)).map((row) => ({ ...row }))
    }
  }

  getSupplyParameters(materialCodes: readonly string[]): SupplyParameter[] {
    const codes = new Set(materialCodes)
    return MOCK_SUPPLY_PARAMETERS.filter((row) => codes.has(row.materialCode)).map((row) => ({ ...row }))
  }

  getSubstitutes(materialCodes: readonly string[]): SubstituteOption[] {
    const codes = new Set(materialCodes)
    return MOCK_SUBSTITUTES.filter((row) => codes.has(row.materialCode)).map((row) => ({ ...row }))
  }
}
