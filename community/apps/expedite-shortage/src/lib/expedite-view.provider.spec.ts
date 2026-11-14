/**
 * 视图提供者、助手模板、界面产物的契约测试。
 */
import { readFileSync } from 'node:fs'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import plugin from '../index.js'
import { EXPEDITE_FEATURE, MIDDLEWARE_NAME, REMOTE_ENTRY, VIEW_KEY, VIEW_PROVIDER_KEY } from './constants.js'
import { ExpediteViewProvider, VIEW_ACTION_KEYS, messageLocale } from './expedite-view.provider.js'
import type { ExpediteService } from './expedite.service.js'
import { catalogs, normalizeLocale } from './remote-components/expedite-workbench/src/i18n.js'
import { TEMPLATE_DSL, TEMPLATE_KEY, templates } from './templates.js'
import { SCOPE, createService, createTestDataSource } from './testing/test-db.js'
import { EXPEDITE_MUTATION_TOOL_NAMES } from './tool-schemas.js'

let dataSource: DataSource
let service: ExpediteService
let provider: ExpediteViewProvider

const context: XpertResolvedViewHostContext = {
  tenantId: SCOPE.tenantId,
  organizationId: SCOPE.organizationId,
  userId: SCOPE.userId,
  hostType: 'agent',
  hostId: 'assistant-1',
  slots: [],
  locale: 'zh-Hans'
}

beforeEach(async () => {
  dataSource = await createTestDataSource()
  ;({ service } = createService(dataSource))
  provider = new ExpediteViewProvider(service)
})
afterEach(async () => {
  await dataSource.destroy()
})

describe('view manifest', () => {
  it('declares a feature-gated remote view with least-privilege commands and mutation events', () => {
    const [manifest] = provider.getViewManifests(context, 'agent.workbench.fixed')
    expect(manifest?.key).toBe(VIEW_KEY)
    expect(manifest?.activation?.requiredFeatures).toEqual([EXPEDITE_FEATURE])
    expect(manifest?.view).toMatchObject({ type: 'remote_component', component: { isolation: 'iframe', entry: REMOTE_ENTRY } })
    expect(manifest?.clientCommands?.map((command) => command.key)).toEqual([ASSISTANT_CHAT_SEND_MESSAGE_COMMAND])
    expect(manifest?.actions?.map((action) => action.key)).toEqual([...VIEW_ACTION_KEYS])
    const subscription = manifest?.hostEvents?.subscriptions?.[0]
    expect(subscription?.action).toMatchObject({ type: 'forward' })
    expect(subscription?.filter?.toolNames).toEqual([...EXPEDITE_MUTATION_TOOL_NAMES])
    expect(provider.getViewManifests(context, 'agent.workbench.main')).toHaveLength(1)
    expect(provider.getViewManifests(context, 'other.slot')).toEqual([])
    expect(provider.getViewManifests({ ...context, hostType: 'project' }, 'agent.workbench.main')).toEqual([])
  })
})

describe('view actions', () => {
  it('seeds, lists, starts an analysis and returns the chat command to invoke', async () => {
    expect(await provider.executeViewAction(context, VIEW_KEY, 'seed_demo_requests', { input: {} })).toMatchObject({
      success: true,
      data: { inserted: 3 }
    })
    const data = await provider.getViewData(context, VIEW_KEY, { page: 1, pageSize: 20, search: 'SO-1024' })
    const list = (data.item as { list: { items: { id: string }[] } }).list
    expect(list.items).toHaveLength(1)
    const requestId = list.items[0]!.id
    const started = await provider.executeViewAction(context, VIEW_KEY, 'start_analysis', { input: { requestId } })
    expect(started.success).toBe(true)
    const payload = started.data as {
      commandKey: string
      commandPayload: { text: string; newThread: boolean; clientMessageId: string }
      created: boolean
      jobId: string
    }
    expect(payload.commandKey).toBe(ASSISTANT_CHAT_SEND_MESSAGE_COMMAND)
    expect(payload.commandPayload).toMatchObject({ newThread: true, clientMessageId: payload.jobId })
    expect(payload.commandPayload.text).toMatch(/^请为提前交货请求做缺料分析。\nanalysisJobId: [0-9a-f-]{36}/)
    // 选中后返回详情
    const selected = await provider.getViewData(context, VIEW_KEY, { selectionId: requestId })
    expect((selected.item as { detail: { request: { status: string } } }).detail.request.status).toBe('analyzing')
  })

  it('rejects undeclared actions, identity fields in input and other views', async () => {
    expect(await provider.executeViewAction(context, VIEW_KEY, 'drop_tables', { input: {} })).toMatchObject({
      success: false,
      data: { code: 'NOT_FOUND' }
    })
    const injected = await provider.executeViewAction(context, VIEW_KEY, 'create_request', {
      input: { orderNo: 'SO-9', customerName: 'x', productCode: 'X1', quantity: 1, originalDueDate: '2026-12-05', targetDate: '2026-11-25', tenantId: 'other' }
    })
    expect(injected).toMatchObject({ success: false, data: { code: 'VALIDATION_FAILED' } })
    await expect(provider.getViewData(context, 'other.view', {})).rejects.toThrow(/unsupported_view/)
  })

  it('renders the iframe HTML from the generated assets', async () => {
    const entry = await provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: REMOTE_ENTRY })
    expect(entry.contentType).toContain('text/html')
    expect(entry.html.length).toBeGreaterThan(1000)
    await expect(provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: '../secret' })).rejects.toThrow()
  })

  it('maps host locales to the chat message language', () => {
    expect(messageLocale('zh-Hans')).toBe('zh-Hans')
    expect(messageLocale('zh_CN')).toBe('zh-Hans')
    expect(messageLocale('en_US')).toBe('en-US')
    expect(messageLocale(undefined)).toBe('en-US')
  })
})

describe('assistant template', () => {
  it('links the template, middleware provider and default view', () => {
    expect(templates.map((template) => template.key)).toEqual([TEMPLATE_KEY])
    expect(plugin.templates).toBe(templates)
    expect(TEMPLATE_DSL).toContain(`provider: ${MIDDLEWARE_NAME}`)
    expect(TEMPLATE_DSL).toContain('provider: ContextCompressionMiddleware')
    expect(TEMPLATE_DSL).toContain('provider: todoListMiddleware')
    expect(TEMPLATE_DSL).toContain(`defaultViewKey: ${VIEW_KEY}`)
    expect(TEMPLATE_DSL).toContain('order: [Middleware_ContextCompression, Middleware_Todo, Middleware_Expedite]')
    // 回归：平台按执行图节点计步（模型、工具、3 个中间件钩子都算），40 步在第 7 次工具调用前耗尽（11-13 实测）
    const limit = Number(/recursionLimit: (\d+)/.exec(TEMPLATE_DSL)?.[1])
    expect(limit).toBeGreaterThanOrEqual(100)
    // 模板不写死模型，从模板安装时由用户选择组织已配置的模型
    expect(TEMPLATE_DSL).not.toMatch(/copilotModel|qwen|deepseek/i)
    for (const app of plugin.meta.targetApps ?? []) {
      expect(plugin.meta.targetAppMeta?.[app]?.runtime?.viewProviders).toEqual([VIEW_PROVIDER_KEY])
    }
  })
})

describe('remote view', () => {
  it('keeps the zh-Hans and en-US catalogs in parity', () => {
    expect(Object.keys(catalogs['en-US']).sort()).toEqual(Object.keys(catalogs['zh-Hans']).sort())
    expect(normalizeLocale('zh_Hans')).toBe('zh-Hans')
    // 繁体不回退成简体
    expect(normalizeLocale('zh-Hant')).toBe('en-US')
  })

  it('never touches Web Storage in source or generated assets', () => {
    const dir = new URL('./remote-components/expedite-workbench/', import.meta.url)
    for (const file of ['src/main.tsx', 'src/bridge.ts', 'app.js']) {
      expect(readFileSync(new URL(file, dir), 'utf8')).not.toMatch(/localStorage|sessionStorage/)
    }
  })
})
