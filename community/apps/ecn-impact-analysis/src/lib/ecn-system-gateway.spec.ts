import { describe, expect, it } from 'vitest'
import { EcnTransientGatewayError, MockEcnSystemGateway } from './ecn-system-gateway'

describe('MockEcnSystemGateway（模拟 PLM/ERP/MES 数据集）', () => {
  it('按物料号精确查询物料档案', async () => {
    const gateway = new MockEcnSystemGateway()
    const material = await gateway.getMaterial('P-1003')
    expect(material).not.toBeNull()
    expect(material!.name).toBe('轴承座')
    expect(material!.material).toBe('HT200')
    expect(await gateway.getMaterial('NOPE-1')).toBeNull()
  })

  it('BOM 父件链带完整 relationPath 证据（P-1003 → A-210 → EA-200）', async () => {
    const gateway = new MockEcnSystemGateway()
    const parents = await gateway.searchBomParents('P-1003', 3)
    const a210 = parents.find((p) => p.parentNo === 'A-210')
    const ea200 = parents.find((p) => p.parentNo === 'EA-200')
    expect(a210).toBeDefined()
    expect(a210!.depth).toBe(1)
    expect(a210!.quantityPer).toBe(2)
    expect(ea200).toBeDefined()
    expect(ea200!.depth).toBe(2)
    expect(ea200!.relationPath).toContain('P-1003')
    expect(ea200!.relationPath).toContain('A-210')
    expect(ea200!.relationPath).toContain('EA-200')
    // 数量乘积语义：EA-200 上层证据链可达
    expect(parents.every((p) => p.relationPath.split(' > ').length === p.depth + 1)).toBe(true)
  })

  it('深度限制生效', async () => {
    const gateway = new MockEcnSystemGateway()
    const parents = await gateway.searchBomParents('P-1003', 1)
    expect(parents.map((p) => p.parentNo)).toEqual(['A-210'])
  })

  it('数据集自身一致：BOM 父子件都存在于物料主数据', async () => {
    const gateway = new MockEcnSystemGateway()
    for (const materialNo of ['EA-200', 'A-210', 'A-220', 'A-230', 'A-240', 'P-1003']) {
      expect(await gateway.getMaterial(materialNo)).not.toBeNull()
    }
    const parents = await gateway.searchBomParents('P-1003', 3)
    for (const parent of parents) {
      expect(await gateway.getMaterial(parent.parentNo)).not.toBeNull()
    }
  })

  it('工艺路线与在制工单按物料集合过滤', async () => {
    const gateway = new MockEcnSystemGateway()
    const routings = await gateway.searchRoutings(['P-1003', 'A-210', 'EA-200'])
    expect(routings.map((r) => r.routingNo).sort()).toEqual(['RT-1003', 'RT-200', 'RT-210'].sort())
    const orders = await gateway.searchProductionOrders(['P-1003'])
    expect(orders.length).toBe(2)
    expect(orders.every((o) => o.status !== undefined)).toBe(true)
  })

  it('库存包含旧批次与在途，供旧料处置分析', async () => {
    const gateway = new MockEcnSystemGateway()
    const inventory = await gateway.searchInventory(['R-3001'])
    const types = inventory.map((i) => i.type)
    expect(types).toContain('on_hand')
    expect(types).toContain('in_transit')
    const onHand = inventory.find((i) => i.type === 'on_hand')!
    expect(onHand.quantity).toBe(0)
  })

  it('失败模拟：第一次库存查询抛瞬态错误，重试成功', async () => {
    const gateway = new MockEcnSystemGateway()
    gateway.setFailureSimulation(true)
    await expect(gateway.searchInventory(['P-1003'])).rejects.toBeInstanceOf(EcnTransientGatewayError)
    const retried = await gateway.searchInventory(['P-1003'])
    expect(retried.length).toBeGreaterThan(0)
    // 只失败一次：后续查询全部正常
    const third = await gateway.searchInventory(['P-1003'])
    expect(third.length).toBe(retried.length)
  })

  it('未开启失败模拟时不抛错', async () => {
    const gateway = new MockEcnSystemGateway()
    const inventory = await gateway.searchInventory(['P-1003'])
    expect(inventory.length).toBe(3)
  })
})
