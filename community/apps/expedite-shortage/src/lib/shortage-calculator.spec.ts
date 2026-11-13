/**
 * 缺料计算单测：三条演示请求必须先在这里得到预期结论，才能拿去演示。
 */
import { describe, expect, it } from 'vitest'
import { addDays, computeAvailability, earliestAvailableDate, explodeBom } from './shortage-calculator.js'
import { DEMO_REQUESTS } from './supply/mock-data.js'
import { MockSupplyDataSource } from './supply/mock-supply-data-source.js'

const source = new MockSupplyDataSource()
const findMaterial = (code: string) => source.getMaterial(code)

async function analyse(orderNo: string) {
  const request = DEMO_REQUESTS.find((item) => item.orderNo === orderNo)
  if (!request) throw new Error(`missing demo request ${orderNo}`)
  const product = source.getProduct(request.productCode)
  if (!product) throw new Error(`missing product ${request.productCode}`)
  const requirements = explodeBom(product, request.quantity, findMaterial)
  const position = await source.getInventoryPosition(
    requirements.map((line) => line.materialCode),
    { simulateInventoryOutage: false }
  )
  const lines = computeAvailability(requirements, position.inventory, position.inbound, request.targetDate)
  const shortages = lines.filter((line) => line.shortageQty > 0)
  const params = source.getSupplyParameters(shortages.map((line) => line.materialCode))
  const earliest = shortages.map((line) =>
    earliestAvailableDate(
      line.requiredQty,
      line.onHand,
      [...line.inboundInWindow, ...line.inboundLate],
      params.find((row) => row.materialCode === line.materialCode)?.leadTimeDays ?? 0,
      source.getAsOfDate()
    )
  )
  return { request, lines, shortages, earliest }
}

describe('explodeBom', () => {
  it('merges the same material used by several components', () => {
    const product = source.getProduct('X1')!
    const lines = explodeBom(product, 50, findMaterial)
    const terminal = lines.find((line) => line.materialCode === 'W-402')!
    // 配电组件 4 条 + 线束组件 6 条 = 每台 10 条
    expect(terminal.qtyPerProduct).toBe(10)
    expect(terminal.requiredQty).toBe(500)
    expect(terminal.usages.map((usage) => usage.componentCode)).toEqual(['K-30', 'K-40'])
    // 同一物料只出现一行
    expect(new Set(lines.map((line) => line.materialCode)).size).toBe(lines.length)
  })

  it('rejects a BOM that references an unknown material', () => {
    const product = { code: 'Z', name: 'Z', components: [{ code: 'K', name: 'K', qtyPer: 1, items: [{ materialCode: 'NOPE', qtyPer: 1 }] }] }
    expect(() => explodeBom(product, 1, findMaterial)).toThrow(/NOPE/)
  })
})

describe('computeAvailability', () => {
  it('counts only inbound orders arriving on or before the target date', () => {
    const [line] = computeAvailability(
      [{ materialCode: 'A', materialName: 'A', unit: 'pc', qtyPerProduct: 1, requiredQty: 100, usages: [] }],
      [{ materialCode: 'A', onHand: 10 }],
      [
        { poNo: 'PO-2', materialCode: 'A', qty: 30, eta: '2026-11-26' },
        { poNo: 'PO-1', materialCode: 'A', qty: 20, eta: '2026-11-25' }
      ],
      '2026-11-25'
    )
    expect(line!.availableQty).toBe(30)
    expect(line!.shortageQty).toBe(70)
    expect(line!.inboundInWindow.map((order) => order.poNo)).toEqual(['PO-1'])
    expect(line!.inboundLate.map((order) => order.poNo)).toEqual(['PO-2'])
  })
})

describe('earliestAvailableDate', () => {
  it('returns the as-of date when stock already covers demand', () => {
    expect(earliestAvailableDate(10, 10, [], 30, '2026-11-12')).toBe('2026-11-12')
  })
  it('takes the earlier of covering inbound and a fresh purchase order', () => {
    const inbound = [{ poNo: 'PO-1', materialCode: 'A', qty: 50, eta: '2026-12-20' }]
    expect(earliestAvailableDate(50, 10, inbound, 10, '2026-11-12')).toBe('2026-11-22')
    expect(earliestAvailableDate(50, 10, inbound, 60, '2026-11-12')).toBe('2026-12-20')
  })
  it('adds days across month boundaries', () => {
    expect(addDays('2026-11-12', 20)).toBe('2026-12-02')
  })
})

describe('demo requests', () => {
  it('SO-1024 is short of P-201 and B-110 only (conditional)', async () => {
    const { shortages, earliest } = await analyse('SO-1024')
    expect(shortages.map((line) => [line.materialCode, line.requiredQty, line.availableQty, line.shortageQty])).toEqual([
      ['P-201', 50, 30, 20],
      ['B-110', 100, 60, 40]
    ])
    // 在途 PO-778、PO-790 都在目标日之后，是催料对象
    expect(shortages.map((line) => line.inboundLate.map((order) => order.poNo))).toEqual([['PO-778'], ['PO-790']])
    expect(earliest).toEqual(['2026-12-02', '2026-12-03'])
    // B-110 有替代料，且替代料库存足够覆盖缺口
    const [substitute] = source.getSubstitutes(['B-110'])
    expect(substitute?.substituteCode).toBe('B-110A')
  })

  it('SO-1031 is infeasible: S-211 earliest date is after the target', async () => {
    const { request, shortages, earliest } = await analyse('SO-1031')
    expect(shortages.map((line) => [line.materialCode, line.requiredQty, line.availableQty, line.shortageQty])).toEqual([
      ['S-211', 40, 20, 20]
    ])
    // 在途 PO-812 在目标日前到货，已计入可用量
    expect(shortages[0]!.inboundInWindow.map((order) => order.poNo)).toEqual(['PO-812'])
    expect(source.getSubstitutes(['S-211'])).toEqual([])
    expect(earliest).toEqual(['2026-12-02'])
    expect(earliest[0]! > request.targetDate).toBe(true)
    expect(request.demoFailInventoryOnce).toBe(true)
  })

  it('SO-1040 has no shortage', async () => {
    const { shortages, lines } = await analyse('SO-1040')
    expect(shortages).toEqual([])
    expect(lines.length).toBeGreaterThan(10)
  })

  it('every demo request asks for an earlier date than originally promised', () => {
    for (const request of DEMO_REQUESTS) expect(request.targetDate < request.originalDueDate).toBe(true)
  })
})

describe('mock supply data source', () => {
  it('raises a stable business error when the inventory outage is simulated', async () => {
    await expect(source.getInventoryPosition(['P-201'], { simulateInventoryOutage: true })).rejects.toMatchObject({
      code: 'INVENTORY_UNAVAILABLE'
    })
  })
})
