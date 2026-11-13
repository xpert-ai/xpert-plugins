import test from 'node:test'
import assert from 'node:assert/strict'
import { TicketService } from '../dist/lib/ticket.service.js'
import { SmartTicketError } from '../dist/lib/domain/contracts.js'

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
    async find(options) {
      const items = Array.from(store.values())
      if (!options || !options.where) return items
      return items.filter((item) => {
        for (const [key, val] of Object.entries(options.where)) {
          if (item[key] !== val) return false
        }
        return true
      })
    },
    async findOne(options) {
      const items = await this.find(options)
      return items[0] || null
    },
    async remove(item) {
      store.delete(item.id)
      return item
    },
    _getStore() {
      return store
    }
  }
}

const mockScope = {
  tenantId: 'tenant_demo',
  organizationId: 'org_demo',
  workspaceId: 'ws_demo',
  userId: 'user_demo',
  xpertId: 'agent_demo'
}

test('TicketService - 基础业务流程：分析客诉并生成结构化草稿', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)

  const ticket = await service.analyzeAndDraft(mockScope, {
    rawContent: '我们在支付购买企业版时，微信支付扣款了 999 元，但是系统提示订单失败，请尽快退款或补发会员！'
  })

  assert.ok(ticket.id.startsWith('ticket_'))
  assert.equal(ticket.category, 'billing')
  assert.equal(ticket.priority, 'P1')
  assert.equal(ticket.status, 'pending_review')
  assert.ok(ticket.suggestedReply.includes('账单复核'))
  assert.ok(ticket.summary.includes('业务分类判断'))
  assert.equal(ticket.tenantId, mockScope.tenantId)
  assert.equal(ticket.workspaceId, mockScope.workspaceId)
})

test('TicketService - 输入校验：少于10个字符时抛出 CONTENT_TOO_SHORT', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)

  await assert.rejects(
    async () => {
      await service.analyzeAndDraft(mockScope, {
        rawContent: '坏了'
      })
    },
    (err) => {
      assert.ok(err instanceof SmartTicketError)
      assert.equal(err.code, 'CONTENT_TOO_SHORT')
      return true
    }
  )
})

test('TicketService - 异常模拟与重试：模拟超时抛错并在重试后恢复', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)

  // 1. 模拟上游大模型/接口超时
  await assert.rejects(
    async () => {
      await service.analyzeAndDraft(mockScope, {
        rawContent: '系统后台管理列表加载极为卡顿，建议进行分页优化。',
        simulateFailure: true
      })
    },
    (err) => {
      assert.ok(err instanceof SmartTicketError)
      assert.equal(err.code, 'SIMULATED_SERVICE_TIMEOUT')
      return true
    }
  )

  // 2. 正常输入分析成功
  const ticket = await service.analyzeAndDraft(mockScope, {
    rawContent: '系统后台管理列表加载极为卡顿，建议进行分页优化。'
  })
  assert.equal(ticket.status, 'pending_review')

  // 3. 模拟对已存在工单重试超时
  await assert.rejects(
    async () => {
      await service.retryAnalysis(mockScope, {
        id: ticket.id,
        simulateFailure: true
      })
    },
    (err) => {
      assert.equal(err.code, 'SIMULATED_SERVICE_TIMEOUT')
      return true
    }
  )

  // 4. 重试成功恢复正常
  const retried = await service.retryAnalysis(mockScope, {
    id: ticket.id,
    simulateFailure: false
  })
  assert.equal(retried.retryCount, 2)
  assert.equal(retried.failureCode, null)
})

test('TicketService - 人工确认与持久化：状态变更为 confirmed 并保存人工微调', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)

  const ticket = await service.analyzeAndDraft(mockScope, {
    rawContent: '客户登录密码提示被重置了，收不到短信验证码，怀疑被盗号了，非常紧急！'
  })

  assert.equal(ticket.category, 'account_security')
  assert.equal(ticket.priority, 'P0')
  assert.equal(ticket.sentiment, 'negative_urgent')

  // 客服人工微调回复草稿并确认保存
  const confirmed = await service.confirmAndSave(mockScope, {
    id: ticket.id,
    suggestedReply: '【客服专线加急】您好，安全组已紧急对您的账号进行了保护性封锁，请接听 400 专属电话核验身份。'
  })

  assert.equal(confirmed.status, 'confirmed')
  assert.equal(confirmed.revision, 2)
  assert.ok(confirmed.suggestedReply.includes('客服专线加急'))

  // 刷新后读取验证持久化
  const reloaded = await service.getTicket(mockScope, ticket.id)
  assert.equal(reloaded.status, 'confirmed')
  assert.equal(reloaded.suggestedReply, confirmed.suggestedReply)
})

test('TicketService - 权限隔离与删除测试', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)

  const ticket = await service.analyzeAndDraft(mockScope, {
    rawContent: '希望能在移动端增加扫码登录功能，体验会好很多。'
  })

  const otherScope = {
    ...mockScope,
    tenantId: 'other_tenant'
  }

  // 其他租户无法查询到
  const otherList = await service.listTickets(otherScope)
  assert.equal(otherList.length, 0)

  // 本租户可以正常列出与删除
  const list = await service.listTickets(mockScope)
  assert.equal(list.length, 1)

  const delRes = await service.deleteTicket(mockScope, { id: ticket.id })
  assert.equal(delRes.success, true)

  const afterDelList = await service.listTickets(mockScope)
  assert.equal(afterDelList.length, 0)
})
