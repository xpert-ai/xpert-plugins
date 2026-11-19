import test from 'node:test'
import assert from 'node:assert/strict'
import { SmartTicketMiddleware } from '../dist/lib/ticket.middleware.js'
import { TicketService } from '../dist/lib/ticket.service.js'

function createMockRepository() {
  const store = new Map()
  return {
    create(data) {
      return { ...data }
    },
    async save(item) {
      store.set(item.id, { ...item })
      return { ...item }
    },
    async find() {
      return Array.from(store.values())
    },
    async findOne(options) {
      const items = await this.find(options)
      return items[0] || null
    },
    async remove(item) {
      store.delete(item.id)
      return item
    }
  }
}

const mockAgentContext = {
  tenantId: 'tenant_demo',
  organizationId: 'org_demo',
  workspaceId: 'ws_demo',
  userId: 'user_demo',
  xpertId: 'agent_demo'
}

test('SmartTicketMiddleware - 暴露符合规范的三个 LangChain Tools', () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)
  const middlewareStrategy = new SmartTicketMiddleware(service)

  assert.deepEqual(middlewareStrategy.getToolNames(), [
    'ticket_analyze_and_draft',
    'ticket_confirm_and_save',
    'ticket_list_records'
  ])

  const middleware = middlewareStrategy.createMiddleware({}, mockAgentContext)
  assert.equal(middleware.name, 'SmartTicketMiddleware')
  assert.equal(middleware.tools.length, 3)
})

test('SmartTicketMiddleware - 工具调用：ticket_analyze_and_draft 正常与异常处理', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)
  const middlewareStrategy = new SmartTicketMiddleware(service)
  const middleware = middlewareStrategy.createMiddleware({}, mockAgentContext)
  const analyzeTool = middleware.tools.find(
    (t) => t.name === 'ticket_analyze_and_draft'
  )

  // 1. 正常分析
  const resStr = await analyzeTool.invoke({
    rawContent: '我们在支付购买企业版时，微信支付扣款了 999 元，但是系统提示订单失败。'
  })
  const res = JSON.parse(resStr)
  assert.equal(res.success, true)
  assert.ok(res.ticket.id)
  assert.equal(res.ticket.category, 'billing')

  // 2. 异常输入（过短）
  const errResStr = await analyzeTool.invoke({
    rawContent: '太差了'
  })
  const errRes = JSON.parse(errResStr)
  assert.equal(errRes.success, false)
  assert.equal(errRes.code, 'CONTENT_TOO_SHORT')
})
