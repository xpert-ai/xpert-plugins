import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { parse } from 'yaml'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { plugin } from '../src/index.js'
import { templates } from '../src/templates.js'
import { TicketRecord } from '../src/ticket.entity.js'
import { TicketService } from '../src/ticket.service.js'
import { SupportTriageViewProvider } from '../src/view.provider.js'
import { AnalysisMiddleware } from '../src/analysis.middleware.js'
import { scopeFromAgent, scopeFromView } from '../src/scope.js'
import { ACTION_KEYS, FEATURE, MIDDLEWARE_NAME, MUTATION_TOOL_NAMES, PLUGIN_NAMESPACE, TEMPLATE_KEY, TOOL_NAMES, VIEW_KEY } from '../src/constants.js'

const context: XpertResolvedViewHostContext = {
  tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace', userId: 'user', hostType: 'agent', hostId: 'assistant',
  capabilities: { features: [FEATURE] }, slots: [{ key: 'agent.workbench.main', mode: 'tabs' }]
}
const agentContext: IAgentMiddlewareContext = {
  tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace', userId: 'user', xpertId: 'assistant',
  node: { id: 'test-middleware-node', type: WorkflowNodeTypeEnum.MIDDLEWARE, key: 'Middleware_SupportTriage', provider: MIDDLEWARE_NAME }, tools: new Map(),
  runtime: {
    createModelClient: async () => { throw new Error('Model access is not part of domain contract tests') },
    wrapWorkflowNodeExecution: async () => { throw new Error('Workflow wrapping is not used by this middleware') }
  }
}
const analysis = { summary: '无法登录', category: 'account', priority: 'normal', evidence: ['无法登录'], missingInfo: ['错误提示'], replyDraft: '请提供错误提示以便核查。', rationale: '原文反馈账户登录问题。' }

test('metadata, Assistant graph and exact tool boundary agree', async () => {
  assert.equal(plugin.meta.level, 'tenant')
  assert.equal(plugin.meta.artifactNamespace, PLUGIN_NAMESPACE)
  const template = templates.find(item => item.key === TEMPLATE_KEY)
  assert.ok(template)
  assert.ok(typeof template.dslContent === 'string')
  const dsl = z.object({ nodes: z.array(z.object({ key: z.string(), entity: z.object({ provider: z.string().optional() }).passthrough() }).passthrough()),
    connections: z.array(z.object({ from: z.string(), to: z.string() }).passthrough()) }).passthrough().parse(parse(template.dslContent))
  assert.equal(dsl.nodes.filter(node => node.entity.provider === MIDDLEWARE_NAME).length, 1)
  assert.ok(dsl.connections.some(connection => connection.from === 'Agent_SupportTriage' && connection.to === 'Middleware_SupportTriage'))
  const marketplace = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents
  assert.equal(marketplace?.find(item => item.type === 'app')?.appConfig?.assistantTemplateKey, TEMPLATE_KEY)
  const database = await new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true }).initialize()
  try {
    const middleware = new AnalysisMiddleware(new TicketService(database.getRepository(TicketRecord)))
    assert.deepEqual(middleware.getToolNames(), TOOL_NAMES)
    assert.ok(!middleware.getToolNames().some(name => name.includes('confirm') || name.includes('send')))
    assert.deepEqual(middleware.meta.features, [FEATURE])
    assert.equal(database.getMetadata(TicketRecord).tableName, 'plugin_support_triage_ticket')
  } finally { await database.destroy() }
})

test('view declares only allowed actions/commands and refreshes only analysis mutations', async () => {
  const database = await new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true }).initialize()
  try {
    const provider = new SupportTriageViewProvider(new TicketService(database.getRepository(TicketRecord)))
    const manifests = provider.getViewManifests(context, 'agent.workbench.main')
    assert.equal(manifests.length, 1)
    assert.deepEqual(manifests[0].activation?.requiredFeatures, [FEATURE])
    assert.deepEqual(manifests[0].actions?.map(item => item.key), ACTION_KEYS)
    assert.deepEqual(manifests[0].clientCommands?.map(item => item.key), ['assistant.chat.send_message'])
    assert.deepEqual(manifests[0].hostEvents?.subscriptions?.[0].filter?.toolNames, MUTATION_TOOL_NAMES)
    assert.deepEqual(provider.getViewManifests(context, 'unrelated.slot'), [])
    const unauthorized = await provider.executeViewAction({ ...context, capabilities: { features: [] } }, VIEW_KEY, 'create_ticket', {
      input: { requestId: randomUUID(), title: '登录问题', customerAlias: '客户', message: '无法登录' }
    })
    assert.equal(unauthorized.success, false)
    assert.deepEqual(unauthorized.data, { code: 'forbidden' })
    const unknown = await provider.executeViewAction(context, VIEW_KEY, 'support_triage_save_analysis', { input: {} })
    assert.equal(unknown.success, false)
    assert.equal(await database.getRepository(TicketRecord).count(), 0)
  } finally { await database.destroy() }
})

test('real middleware tools call persistence and cannot confirm or cross scope', async () => {
  const database = await new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true }).initialize()
  try {
    const service = new TicketService(database.getRepository(TicketRecord))
    const provider = new SupportTriageViewProvider(service)
    const createdResult = await provider.executeViewAction(context, VIEW_KEY, 'create_ticket', { input: {
      requestId: randomUUID(), title: '登录问题', customerAlias: '客户', message: '无法登录'
    } })
    const created = z.object({ ticketId: z.string(), revision: z.number() }).parse(createdResult.data)
    const startedResult = await provider.executeViewAction(context, VIEW_KEY, 'analyze_ticket', { input: { ticketId: created.ticketId, expectedRevision: created.revision } })
    const started = z.object({ attemptId: z.string() }).parse(startedResult.data)
    const middleware = new AnalysisMiddleware(service).createMiddleware({}, agentContext)
    const tools = middleware.tools ?? []
    assert.deepEqual(tools.map(item => item.name), TOOL_NAMES)
    const read = tools.find(item => item.name === TOOL_NAMES[0])
    const save = tools.find(item => item.name === TOOL_NAMES[1])
    assert.ok(read && save)
    assert.deepEqual(read.metadata?.toolName, { en_US: 'Read ticket source', zh_Hans: '读取工单原文' })
    const readResult = await read.invoke({ ticketId: created.ticketId, attemptId: started.attemptId })
    assert.equal(JSON.parse(String(readResult)).message, '无法登录')
    const saved = JSON.parse(String(await save.invoke({ ticketId: created.ticketId, attemptId: started.attemptId, analysis })))
    assert.equal(saved.success, true)
    assert.equal(saved.status, 'pending_review')
    assert.ok(!('message' in saved) && !('tenantId' in saved) && !('analysis' in saved))
    assert.equal((await service.get(scopeFromView(context), created.ticketId)).confirmedAt, null)
    const foreign = new AnalysisMiddleware(service).createMiddleware({}, { ...agentContext, userId: 'different-user' })
    const foreignRead = foreign.tools?.find(item => item.name === TOOL_NAMES[0])
    assert.ok(foreignRead)
    const denied = JSON.parse(String(await foreignRead.invoke({ ticketId: created.ticketId, attemptId: started.attemptId })))
    assert.equal(denied.code, 'not_found')
    assert.equal(denied.success, false)
  } finally { await database.destroy() }
})

test('client command failure is immediately recoverable and late analysis is rejected', async () => {
  const database = await new DataSource({ type: 'sqljs', entities: [TicketRecord], synchronize: true }).initialize()
  try {
    const service = new TicketService(database.getRepository(TicketRecord))
    const scope = scopeFromAgent(agentContext)
    const created = await service.create(scope, { requestId: randomUUID(), title: '登录问题', customerAlias: '客户', message: '无法登录' })
    const attempt = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: created.revision })
    const provider = new SupportTriageViewProvider(service)
    const aborted = await provider.executeViewAction(context, VIEW_KEY, 'abort_analysis', { input: { ticketId: created.ticketId,
      expectedRevision: attempt.revision, attemptId: attempt.attemptId, reason: 'dispatcher_unavailable' } })
    assert.equal(aborted.success, true)
    assert.equal((await service.get(scope, created.ticketId)).status, 'failed')
    await assert.rejects(service.saveAnalysis(scope, { ticketId: created.ticketId, attemptId: attempt.attemptId, analysis: {
      ...analysis, category: 'account', priority: 'normal'
    } }))
    const current = await service.get(scope, created.ticketId)
    const retry = await service.analyze(scope, { ticketId: created.ticketId, expectedRevision: current.revision })
    assert.notEqual(retry.attemptId, attempt.attemptId)
  } finally { await database.destroy() }
})
