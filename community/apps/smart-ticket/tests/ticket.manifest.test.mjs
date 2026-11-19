import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TicketService } from '../dist/lib/ticket.service.js'
import { TicketViewProvider } from '../dist/lib/ticket-view.provider.js'
import {
  ACTION_KEYS,
  FEATURE,
  MIDDLEWARE_NAME,
  PLUGIN_NAME,
  PLUGIN_NAMESPACE,
  PROVIDER_KEY,
  REMOTE_ENTRY,
  TEMPLATE_KEY,
  VIEW_KEY
} from '../dist/lib/constants.js'
import { templates } from '../dist/lib/templates.js'

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
    }
  }
}

const mockViewContext = {
  hostType: 'agent',
  hostId: 'agent_test_id',
  tenantId: 'tenant_test',
  organizationId: 'org_test',
  workspaceId: 'ws_test',
  userId: 'user_test',
  slots: []
}

test('Plugin Metadata & Template 完整性测试', () => {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  )

  assert.equal(pkg.name, PLUGIN_NAME)
  assert.equal(pkg.xpert.plugin.level, 'tenant')
  assert.equal(pkg.xpert.plugin.artifactNamespace, PLUGIN_NAMESPACE)

  assert.equal(templates.length, 1)
  const template = templates[0]
  assert.equal(template.key, TEMPLATE_KEY)
  assert.ok(template.dslContent.includes('smart-ticket-assistant'))
  assert.ok(template.dslContent.includes('Middleware_SmartTicket'))
  assert.ok(template.dslContent.includes('Agent_SmartTicket'))
})

test('TicketViewProvider - 视图 Manifest 与插槽定义测试', () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)
  const provider = new TicketViewProvider(service)

  // 支持 agent 宿主
  assert.equal(provider.supports(mockViewContext), true)

  // 不支持的 slot 返回空
  assert.deepEqual(provider.getViewManifests(mockViewContext, 'unsupported.slot'), [])

  // 支持 agent.workbench.fixed
  const fixedManifests = provider.getViewManifests(
    mockViewContext,
    'agent.workbench.fixed'
  )
  assert.equal(fixedManifests.length, 1)
  const manifest = fixedManifests[0]
  assert.equal(manifest.key, VIEW_KEY)
  assert.equal(manifest.hostType, 'agent')
  assert.deepEqual(manifest.activation.requiredFeatures, [FEATURE])
  assert.equal(manifest.source.plugin, PLUGIN_NAME)
  assert.equal(manifest.source.provider, PROVIDER_KEY)
  assert.equal(manifest.view.component.entry, REMOTE_ENTRY)

  // 校验声明的 Action 列表
  const actionKeys = manifest.actions.map((a) => a.key)
  assert.deepEqual(actionKeys, [...ACTION_KEYS])

  // 校验 Client Commands
  assert.deepEqual(
    manifest.clientCommands.map((c) => c.key),
    ['assistant.composer.append_references']
  )
})

test('TicketViewProvider - 视图动作分发与异常校验测试', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)
  const provider = new TicketViewProvider(service)

  // 1. 测试 analyze_ticket 动作
  const analyzeRes = await provider.executeViewAction(
    mockViewContext,
    VIEW_KEY,
    'analyze_ticket',
    {
      input: {
        rawContent: '我们在支付购买企业版时，微信支付扣款了 999 元，但是系统提示订单失败。'
      }
    }
  )
  assert.equal(analyzeRes.success, true)
  assert.ok(analyzeRes.data.ticket.id)
  const ticketId = analyzeRes.data.ticket.id

  // 2. 测试 getViewData 数据拉取
  const viewData = await provider.getViewData(mockViewContext, VIEW_KEY, {})
  assert.equal(viewData.item.total, 1)
  assert.equal(viewData.item.tickets[0].id, ticketId)

  // 3. 测试 confirm_ticket 动作
  const confirmRes = await provider.executeViewAction(
    mockViewContext,
    VIEW_KEY,
    'confirm_ticket',
    {
      input: {
        id: ticketId,
        suggestedReply: '【人工复核已通过】退款申请已提交财务处理。'
      }
    }
  )
  assert.equal(confirmRes.success, true)
  assert.equal(confirmRes.data.ticket.status, 'confirmed')

  // 4. 测试错误动作与校验拦截
  const shortErrRes = await provider.executeViewAction(
    mockViewContext,
    VIEW_KEY,
    'analyze_ticket',
    {
      input: {
        rawContent: '短'
      }
    }
  )
  assert.equal(shortErrRes.success, false)
  assert.equal(shortErrRes.data.code, 'CONTENT_TOO_SHORT')

  // 5. 测试未知 action
  const unknownRes = await provider.executeViewAction(
    mockViewContext,
    VIEW_KEY,
    'unknown_action',
    { input: {} }
  )
  assert.equal(unknownRes.success, false)
  assert.equal(unknownRes.data.code, 'UNKNOWN_ACTION')

  // 6. 测试 delete_ticket 动作
  const delRes = await provider.executeViewAction(
    mockViewContext,
    VIEW_KEY,
    'delete_ticket',
    { input: { id: ticketId } }
  )
  assert.equal(delRes.success, true)

  const emptyData = await provider.getViewData(mockViewContext, VIEW_KEY, {})
  assert.equal(emptyData.item.total, 0)
})

test('TicketViewProvider - 远程组件 Entry 生成测试', async () => {
  const repo = createMockRepository()
  const service = new TicketService(repo)
  const provider = new TicketViewProvider(service)

  const entry = await provider.getRemoteComponentEntry(
    mockViewContext,
    VIEW_KEY,
    {
      isolation: 'iframe',
      entry: REMOTE_ENTRY
    }
  )

  assert.equal(entry.contentType, 'text/html; charset=utf-8')
  assert.ok(entry.html.includes('智能客诉工单工作台'))
  assert.ok(entry.html.includes('xpertai.remote_component'))
})
