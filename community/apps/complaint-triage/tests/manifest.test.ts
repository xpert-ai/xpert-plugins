// Runs against the built package (dist), because that is what the host loads.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { DataSource, getMetadataArgsStorage } from 'typeorm'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import plugin from '../dist/index.js'
import { ComplaintAnalysisAttempt, ComplaintTicket, ENTITIES } from '../dist/lib/ticket.entity.js'
import { ComplaintTriageMiddleware } from '../dist/lib/triage.middleware.js'
import { ComplaintTriageViewProvider } from '../dist/lib/triage-view.provider.js'
import { ComplaintTriageService } from '../dist/lib/triage.service.js'
import { ACTION_KEYS, FEATURE, MIDDLEWARE_NAME, PLUGIN_NAME, PLUGIN_NAMESPACE, REMOTE_ENTRY, TEMPLATE_KEY, TOOL_NAMES, VIEW_KEY } from '../src/lib/constants.js'
import { scope, ticketInput } from './data.js'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const context: XpertResolvedViewHostContext = { ...scope, hostType: 'agent', hostId: 'assistant-a', slots: [] }

async function harness() {
  const db = new DataSource({ type: 'sqljs', entities: ENTITIES, synchronize: true })
  await db.initialize()
  return { db, service: new ComplaintTriageService(db.getRepository(ComplaintTicket), db.getRepository(ComplaintAnalysisAttempt)) }
}

test('the host can resolve the ESM package through its require-based locator', () => {
  const hostRequire = createRequire(new URL('../package.json', import.meta.url))
  assert.equal(hostRequire.resolve(PLUGIN_NAME), fileURLToPath(new URL('../dist/index.js', import.meta.url)))
})

test('runtime metadata, package metadata and table names agree on level and artifact namespace', () => {
  assert.deepEqual([plugin.meta.name, plugin.meta.version], [pkg.name, pkg.version])
  assert.deepEqual([plugin.meta.level, plugin.meta.artifactNamespace], [pkg.xpert.plugin.level, pkg.xpert.plugin.artifactNamespace])
  assert.deepEqual([plugin.meta.level, plugin.meta.artifactNamespace], ['tenant', PLUGIN_NAMESPACE])

  const tables = getMetadataArgsStorage()
    .tables.filter((table) => (ENTITIES as Function[]).includes(table.target as Function))
    .map((table) => table.name)
  assert.deepEqual(tables.sort(), ['plugin_complaint_triage_analysis_attempt', 'plugin_complaint_triage_ticket'])

  // Every entity carries the isolation columns the service filters on.
  for (const entity of ENTITIES as Function[]) {
    const columns = getMetadataArgsStorage().columns.filter((column) => column.target === entity).map((column) => column.propertyName)
    assert.ok(columns.includes('tenantId') && columns.includes('organizationId'), `${entity.name} lacks isolation columns`)
  }
})

test('exactly one template is linked to the App, and it binds the middleware that activates the view', () => {
  const contents = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents ?? []
  const app = contents.find((item) => item.type === 'app')
  assert.equal(app?.appConfig?.assistantTemplateKey, TEMPLATE_KEY)
  assert.equal(plugin.templates?.filter((template) => template.key === TEMPLATE_KEY).length, 1)
  assert.equal(contents.find((item) => item.type === 'assistant-template')?.name, TEMPLATE_KEY)

  const dsl = String(plugin.templates?.[0].dslContent)
  assert.ok(dsl.includes(`provider: ${MIDDLEWARE_NAME}`), 'the template must bind the triage middleware')
  assert.ok(dsl.includes(`templateKey: ${TEMPLATE_KEY}`))
  for (const tool of TOOL_NAMES) assert.ok(dsl.includes(tool), `the prompt must tell the Assistant when to call ${tool}`)
  assert.equal(dsl, readFileSync(new URL('../src/complaint-triage-assistant.yaml', import.meta.url), 'utf8'))
})

test('the view manifest is feature-gated and declares every backend action, client command and host event it uses', async () => {
  const { db, service } = await harness()
  try {
    const provider = new ComplaintTriageViewProvider(service)
    const middleware = new ComplaintTriageMiddleware(service)
    assert.deepEqual([middleware.meta.name, middleware.meta.features], [MIDDLEWARE_NAME, [FEATURE]])

    assert.deepEqual(provider.getViewManifests(context, 'unsupported.slot'), [])
    assert.deepEqual(provider.getViewManifests({ ...context, hostType: 'knowledgebase' }, 'agent.workbench.main'), [])
    const manifest = provider.getViewManifests(context, 'agent.workbench.fixed')[0]
    assert.deepEqual(manifest.activation?.requiredFeatures, [FEATURE])
    assert.deepEqual(manifest.actions?.map((action) => action.key), [...ACTION_KEYS])
    assert.deepEqual(manifest.clientCommands?.map((command) => command.key), ['assistant.chat.send_message'], 'least privilege')
    assert.deepEqual(manifest.hostEvents?.subscriptions?.[0].filter?.toolNames, [...TOOL_NAMES])
    assert.equal(manifest.hostEvents?.subscriptions?.[0].action?.type, 'forward')
    assert.equal(manifest.workbench?.fixed, true)
    assert.equal(provider.getViewManifests(context, 'agent.workbench.main')[0].workbench, undefined)
  } finally {
    await db.destroy()
  }
})

test('view data and actions: happy path, validation errors as codes, unknown keys rejected, scope from the host only', async () => {
  const { db, service } = await harness()
  try {
    const provider = new ComplaintTriageViewProvider(service)

    const empty = await provider.getViewData(context, VIEW_KEY, {})
    assert.deepEqual([empty.items, empty.total], [[], 0], 'empty state is data, not an error')

    const invalid = await provider.executeViewAction(context, VIEW_KEY, 'create_ticket', { input: { content: '短', channel: 'ecommerce' } })
    assert.deepEqual([invalid.success, invalid.data], [false, { code: 'invalid_input', fields: ['content'] }])

    // The iframe cannot choose its own tenant: unknown keys are rejected, not silently honoured.
    const spoofed = await provider.executeViewAction(context, VIEW_KEY, 'create_ticket', { input: { ...ticketInput, tenantId: 'tenant-b' } })
    assert.equal(spoofed.success, false)

    const created = await provider.executeViewAction(context, VIEW_KEY, 'create_ticket', { input: { ...ticketInput } })
    assert.equal(created.success, true)
    const ticketId = (created.data as { id: string }).id

    const listed = await provider.getViewData(context, VIEW_KEY, { parameters: { status: 'draft' } })
    assert.equal(listed.total, 1)
    const detail = await provider.getViewData(context, VIEW_KEY, { selectionId: ticketId })
    assert.equal((detail.item as { status: string }).status, 'draft')

    const early = await provider.executeViewAction(context, VIEW_KEY, 'confirm_ticket', {
      input: { ticketId, attemptNo: 1, resolution: { category: 'other', severity: 'P4', summary: 's', handling: 'h', replyDraft: 'r' } }
    })
    assert.deepEqual([early.success, early.data], [false, { code: 'invalid_state' }], 'nothing can be confirmed before an analysis exists')

    const unknown = await provider.executeViewAction(context, VIEW_KEY, 'delete_everything', { input: {} })
    assert.deepEqual([unknown.success, unknown.data], [false, { code: 'not_found' }])
    await assert.rejects(provider.getViewData(context, 'someone.else', {}), /not_found/)
    await assert.rejects(provider.getViewData({ ...context, organizationId: 'org-b' }, VIEW_KEY, { selectionId: ticketId }), /not_found/)
  } finally {
    await db.destroy()
  }
})

test('the remote entry serves the built bundle inside the SDK shell and nothing else', async () => {
  const { db, service } = await harness()
  try {
    const provider = new ComplaintTriageViewProvider(service)
    const entry = await provider.getRemoteComponentEntry({ ...context, locale: 'zh-Hans' }, VIEW_KEY, { isolation: 'iframe', entry: REMOTE_ENTRY })
    assert.equal(entry.contentType, 'text/html; charset=utf-8')
    assert.ok(entry.html.includes('<script type="module">') && entry.html.includes('xpertai.remote_component'))
    assert.ok(entry.html.includes('lang="zh-Hans"') && entry.html.includes('.ct-shell'))
    assert.equal(/\blocalStorage\b|\bsessionStorage\b/.test(entry.html), false, 'the iframe has an opaque origin: Web Storage would throw')
    await assert.rejects(provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: '../../secret' }), /not_found/)
  } finally {
    await db.destroy()
  }
})
