/**
 * 工具契约测试：通过真实的 LangChain 工具边界调用（含 schema 校验），后端用 pg-mem。
 */
import type { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PluginAgentTool } from './agent-tool.js'
import { MIDDLEWARE_NAME } from './constants.js'
import { ExpediteShortageMiddleware } from './expedite.middleware.js'
import type { ExpediteService } from './expedite.service.js'
import { SCOPE, createService, createTestDataSource } from './testing/test-db.js'
import { EXPEDITE_TOOL_NAMES, TOOL_NAMES } from './tool-schemas.js'

let dataSource: DataSource
let service: ExpediteService
let tools: Map<string, PluginAgentTool>

beforeEach(async () => {
  dataSource = await createTestDataSource()
  ;({ service } = createService(dataSource))
  const middleware = new ExpediteShortageMiddleware(service)
  tools = new Map(middleware.buildTools(SCOPE, 'conversation-1').map((item) => [item.name, item]))
})
afterEach(async () => {
  await dataSource.destroy()
})

async function call(name: string, input: Record<string, unknown>) {
  const target = tools.get(name)
  if (!target) throw new Error(`missing tool ${name}`)
  const output: unknown = await target.invoke(input)
  return JSON.parse(String(output)) as Record<string, unknown>
}

async function startSo(orderNo: string) {
  await service.seedDemoRequests(SCOPE)
  const item = (await service.listRequests(SCOPE, { search: orderNo })).items[0]!
  return service.startAnalysis(SCOPE, item.id)
}

describe('middleware metadata', () => {
  it('exposes exactly the seven analysis tools with localized titles', () => {
    const middleware = new ExpediteShortageMiddleware(service)
    expect(middleware.meta.name).toBe(MIDDLEWARE_NAME)
    expect(middleware.getToolNames()).toEqual(EXPEDITE_TOOL_NAMES)
    expect([...tools.keys()]).toEqual(EXPEDITE_TOOL_NAMES)
    for (const item of tools.values()) {
      const metadata = item.metadata as { toolName?: { en_US?: string; zh_Hans?: string } } | undefined
      expect(metadata?.toolName?.en_US).toBeTruthy()
      expect(metadata?.toolName?.zh_Hans).toBeTruthy()
    }
    // 确认/驳回不是工具
    expect(EXPEDITE_TOOL_NAMES.some((name) => /confirm|reject|approve|decide/.test(name))).toBe(false)
  })
})

describe('tool contract', () => {
  it('accepts the natural payloads of a full SO-1024 analysis', async () => {
    const { jobId } = await startSo('SO-1024')
    const context = await call(TOOL_NAMES.getContext, { analysisJobId: jobId })
    expect(context).toMatchObject({ success: true, orderNo: 'SO-1024', targetDate: '2026-11-25' })
    // 回执不含内部字段
    expect(JSON.stringify(context)).not.toMatch(/tenantId|organizationId|createdById|org-a|tenant-a/)

    const inventory = await call(TOOL_NAMES.checkInventory, { analysisJobId: jobId })
    expect(inventory['shortageMaterialCodes']).toEqual(['P-201', 'B-110'])
    const options = await call(TOOL_NAMES.supplyOptions, { analysisJobId: jobId, materialCodes: ['P-201', 'B-110'] })
    expect(options['success']).toBe(true)

    expect(
      await call(TOOL_NAMES.saveFinding, {
        analysisJobId: jobId,
        materialCode: 'P-201',
        suggestionType: 'expedite',
        suggestedDate: '2026-11-26',
        rationale: 'Expedite PO-778 (20 pcs, ETA 12-02) to 11-26.'
      })
    ).toMatchObject({ success: true, remainingShortageCodes: ['B-110'] })
    const missing = await call(TOOL_NAMES.finalize, {
      analysisJobId: jobId,
      feasibility: 'conditional',
      recommendedDate: '2026-11-27',
      summary: 'Waiting for one more finding.'
    })
    expect(missing).toMatchObject({ success: false, errorCode: 'MISSING_FINDINGS', details: { materialCodes: ['B-110'] } })
    expect(String(missing['nextAction'])).toContain('shortage_finalize_analysis')
  })

  it('rejects malformed input with actionable parsing errors', async () => {
    const { jobId } = await startSo('SO-1024')
    await expect(call(TOOL_NAMES.getContext, { analysisJobId: 'SO-1024' })).rejects.toThrow(/uuid|analysisJobId/i)
    await expect(call(TOOL_NAMES.getContext, { analysisJobId: jobId, tenantId: 'x' })).rejects.toThrow(/tenantId|unrecognized/i)
    await expect(call(TOOL_NAMES.supplyOptions, { analysisJobId: jobId, materialCodes: [] })).rejects.toThrow(/materialCodes/)
    await expect(
      call(TOOL_NAMES.saveFinding, { analysisJobId: jobId, materialCode: 'P-201', suggestionType: 'expedite', rationale: 'no date given here' })
    ).rejects.toThrow(/suggestedDate/)
    await expect(
      call(TOOL_NAMES.saveFinding, {
        analysisJobId: jobId,
        materialCode: 'P-201',
        suggestionType: 'expedite',
        suggestedDate: '2026-11-26',
        rationale: 'x'.repeat(601)
      })
    ).rejects.toThrow(/rationale/)
    // 模型传数字也会被拒绝：数字由服务端算
    await expect(
      call(TOOL_NAMES.saveFinding, {
        analysisJobId: jobId,
        materialCode: 'P-201',
        suggestionType: 'expedite',
        suggestedDate: '2026-11-26',
        shortageQty: 20,
        rationale: 'Expedite PO-778 to 11-26.'
      })
    ).rejects.toThrow(/shortageQty|unrecognized/i)
  })

  it('turns the simulated outage into a failure receipt the agent can act on', async () => {
    const { jobId } = await startSo('SO-1031')
    await call(TOOL_NAMES.getContext, { analysisJobId: jobId })
    const failed = await call(TOOL_NAMES.checkInventory, { analysisJobId: jobId })
    expect(failed).toMatchObject({ success: false, errorCode: 'INVENTORY_UNAVAILABLE' })
    expect(String(failed['nextAction'])).toContain('shortage_report_failure')
    expect(
      await call(TOOL_NAMES.reportFailure, { analysisJobId: jobId, errorCode: 'INVENTORY_UNAVAILABLE', reason: 'Inventory service unavailable' })
    ).toMatchObject({ success: true, requestStatus: 'failed' })
    // 已失败的任务再调用会得到 JOB_NOT_ACTIVE
    expect(await call(TOOL_NAMES.explodeBom, { analysisJobId: jobId })).toMatchObject({ success: false, errorCode: 'JOB_NOT_ACTIVE' })
  })
})
