// 自动化验证：使用隔离测试数据验证业务结果，不连接真实店铺或操作平台记录。
import test from 'node:test'
import assert from 'node:assert/strict'
import { HumanMessage } from '@langchain/core/messages'
import { CompetitorMonitorMiddleware } from '../dist/lib/middleware.js'
import { MonitorService } from '../dist/lib/service.js'

// 验证目标：模型异常仅更新当前明确轮次并保留原始异常。
test('model failure records only the latest explicit round and preserves the original error', async () => {
  const calls: object[] = []
  const service = Object.create(MonitorService.prototype)
  service.reportAnalysisIssue = async (scope: object, input: object) => { calls.push({ scope, input }) }
  const strategy = new CompetitorMonitorMiddleware(service)
  const middleware = strategy.createMiddleware({}, Object.assign(Object.create(null), { tenantId: 'tenant', organizationId: 'org' }))
  const roundId = '00000000-0000-4000-8000-000000000001'
  const failure = new Error('private upstream error')
  const request = Object.assign(Object.create(null), { messages: [new HumanMessage(`请分析采集轮次 ${roundId}。`)] })
  await assert.rejects(middleware.wrapModelCall!(request, async () => { throw failure }), e => e === failure)
  assert.equal(calls.length, 1)
  assert.ok(JSON.stringify(calls).includes(roundId))
  assert.ok(!JSON.stringify(calls).includes(failure.message))
  request.messages.push(new HumanMessage('现在解释什么是促销'))
  await assert.rejects(middleware.wrapModelCall!(request, async () => { throw failure }))
  assert.equal(calls.length, 1)
  request.messages.pop()
  service.reportAnalysisIssue = async () => { throw new Error('database unavailable') }
  await assert.rejects(middleware.wrapModelCall!(request, async () => { throw failure }), e => e === failure)
})
