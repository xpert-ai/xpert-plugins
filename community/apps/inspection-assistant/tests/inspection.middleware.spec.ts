import { test } from 'node:test'
import assert from 'node:assert/strict'
import { InspectionMiddleware } from '../src/lib/inspection.middleware.js'

function buildMiddleware() {
  const calls: Array<{ tool: string; input: unknown }> = []
  const service = {
    saveAiAnalysis: async (scope: unknown, caseId: string, input: unknown) => {
      calls.push({ tool: 'inspection_analyze_fault', input: { caseId, ...(input as object) } })
      return { id: caseId, status: 'analyzed' }
    },
    searchHistory: async (scope: unknown, input: unknown) => {
      calls.push({ tool: 'inspection_search_history', input })
      return [{ id: 'h1', deviceType: 'BBU', resolution: '更换蓄电池' }]
    },
    saveRecommendation: async (scope: unknown, caseId: string, input: unknown) => {
      calls.push({ tool: 'inspection_save_recommendation', input: { caseId, ...(input as object) } })
      return { id: caseId, status: 'reviewing' }
    },
    reportFailure: async (scope: unknown, caseId: string, input: unknown) => {
      calls.push({ tool: 'inspection_report_failure', input: { caseId, ...(input as object) } })
      return { id: caseId, status: 'failed' }
    }
  }
  const middleware = new InspectionMiddleware(service as never)
  return { middleware, calls }
}

const middlewareContext = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  workspaceId: null,
  projectId: null,
  userId: 'user-1',
  conversationId: null,
  xpertId: 'xpert-1'
}

test('中间件 meta：名称、特性、图标齐全', () => {
  const { middleware } = buildMiddleware()
  assert.equal(middleware.meta.name, 'inspection-assistant-middleware')
  assert.ok(middleware.meta.features.includes('inspection-assistant'))
  assert.equal(middleware.meta.label.zh_Hans, '机房/基站巡检与故障处理助手')
})

test('中间件注册 4 个 Agent 工具', async () => {
  const { middleware } = buildMiddleware()
  const agentMiddleware = await middleware.createMiddleware({}, middlewareContext as never)
  assert.equal(agentMiddleware.name, 'inspection-assistant-middleware')
  assert.equal(agentMiddleware.tools.length, 4)

  const names = agentMiddleware.tools.map((t) => t.name).sort()
  assert.deepEqual(names, [
    'inspection_analyze_fault',
    'inspection_report_failure',
    'inspection_save_recommendation',
    'inspection_search_history'
  ])
})

test('inspection_analyze_fault 调用服务并透传解析字段', async () => {
  const { middleware, calls } = buildMiddleware()
  const agentMiddleware = await middleware.createMiddleware({}, middlewareContext as never)
  const analyzeTool = agentMiddleware.tools.find((t) => t.name === 'inspection_analyze_fault')
  assert.ok(analyzeTool)

  const output = await analyzeTool.invoke({
    caseId: 'case-1',
    deviceType: 'BBU',
    faultCategory: '电源掉电',
    severity: 'high',
    possibleCauses: ['蓄电池失效']
  })
  assert.ok(String(output).includes('analyzed'))
  assert.equal(calls[0].tool, 'inspection_analyze_fault')
  const input = calls[0].input as { caseId: string; deviceType: string }
  assert.equal(input.caseId, 'case-1')
  assert.equal(input.deviceType, 'BBU')
})

test('inspection_search_history 检索历史方案并透传关键词', async () => {
  const { middleware, calls } = buildMiddleware()
  const agentMiddleware = await middleware.createMiddleware({}, middlewareContext as never)
  const searchTool = agentMiddleware.tools.find((t) => t.name === 'inspection_search_history')
  assert.ok(searchTool)

  const output = await searchTool.invoke({
    caseId: 'case-1',
    deviceType: 'BBU',
    keywords: ['掉电', '电源']
  })
  assert.ok(String(output).includes('更换蓄电池'))
  assert.equal((calls[0].input as { keywords: string[] }).keywords.length, 2)
})

test('inspection_save_recommendation 保存建议并引用历史', async () => {
  const { middleware, calls } = buildMiddleware()
  const agentMiddleware = await middleware.createMiddleware({}, middlewareContext as never)
  const recommendTool = agentMiddleware.tools.find((t) => t.name === 'inspection_save_recommendation')
  assert.ok(recommendTool)

  await recommendTool.invoke({
    caseId: 'case-1',
    recommendation: '检查端子并更换蓄电池',
    historyReferenceIds: ['h1']
  })
  const input = calls[0].input as { historyReferenceIds: string[] }
  assert.deepEqual(input.historyReferenceIds, ['h1'])
})

test('inspection_report_failure 标记失败原因', async () => {
  const { middleware, calls } = buildMiddleware()
  const agentMiddleware = await middleware.createMiddleware({}, middlewareContext as never)
  const failTool = agentMiddleware.tools.find((t) => t.name === 'inspection_report_failure')
  assert.ok(failTool)

  const output = await failTool.invoke({ caseId: 'case-1', reason: '描述模糊' })
  assert.ok(String(output).includes('failed'))
  assert.equal((calls[0].input as { reason: string }).reason, '描述模糊')
})
