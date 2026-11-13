import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getMetadataArgsStorage } from 'typeorm'
import plugin from '../dist/index.js'
import { TicketEntity } from '../dist/ticket.entity.js'
import { configSchema, FEATURE, NAMESPACE, VIEW } from '../dist/domain.js'
import { TriageView } from '../dist/view.js'
import { TriageMiddleware } from '../dist/middleware.js'
import { TriageService } from '../dist/service.js'
import { DataSource } from 'typeorm'

test('runtime metadata, namespace, template and human-only confirmation contract', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(plugin.meta.name, pkg.name); assert.equal(plugin.meta.version, pkg.version)
  assert.equal(plugin.meta.level, pkg.xpert.plugin.level)
  assert.equal(plugin.meta.artifactNamespace, NAMESPACE)
  assert.equal(getMetadataArgsStorage().tables.find(table => table.target === TicketEntity)?.name, 'plugin_support_triage_ticket')
  const db = await new DataSource({ type: 'sqljs', entities: [TicketEntity], synchronize: true }).initialize()
  try {
    const service = new TriageService(db.getRepository(TicketEntity), { config: configSchema.parse({}) })
    const middleware = new TriageMiddleware(service)
    assert.deepEqual(middleware.getToolNames(), ['support_ticket_list', 'support_ticket_get', 'support_ticket_create', 'support_ticket_analyze'])
    const view = new TriageView(service)
    const context = { hostType: 'agent', tenantId: 't', organizationId: 'o', userId: 'u', hostId: 'a', slots: [] }
    const [manifest] = view.getViewManifests(context, 'agent.workbench.main')
    assert.equal(manifest.key, VIEW); assert.deepEqual(manifest.activation?.requiredFeatures, [FEATURE])
    assert(manifest.actions?.some(action => action.key === 'confirm'))
    const toolContext = { tenantId: 't', organizationId: 'o', userId: 'u', xpertId: 'a' }
    const tools = middleware.createMiddleware({}, toolContext)
    assert.equal(tools.tools?.length, 4)
    assert.equal(tools.tools?.some(tool => tool.name.includes('confirm')), false)
    assert.equal(view.getViewManifests({ ...context, hostType: 'integration' }, 'agent.workbench.main').length, 0)
    assert.equal(plugin.templates?.[0].key, 'support-triage-assistant')
  } finally { await db.destroy() }
})
