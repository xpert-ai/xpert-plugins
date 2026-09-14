import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { DataSource } from 'typeorm'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import plugin from '../dist/index.js'
import { DockyardWorkspaceViewProvider } from '../dist/lib/workspace-view.provider.js'
import { DockyardWorkspaceService } from '../dist/lib/workspace.service.js'
import { LayoutProposal, WorkspaceRecord } from '../dist/lib/workspace.entity.js'
import { ACTION_KEYS, FEATURE, MIDDLEWARE_NAME, REMOTE_ENTRY, VIEW_KEY } from '../src/lib/constants.js'
import { DockyardLayoutMiddleware } from '../dist/lib/layout.middleware.js'
import { catalogs } from '../src/lib/remote/i18n.js'
import { adaptSample } from '../scripts/adapt-sample.mjs'
import { scope } from './fixtures.js'

test('the public host can resolve the ESM package through its require-based locator', () => {
  const hostRequire = createRequire(new URL('../package.json', import.meta.url))
  assert.equal(hostRequire.resolve('@community/apps-dockyard'), fileURLToPath(new URL('../dist/index.js', import.meta.url)))
})

test('dist metadata links exactly one template, feature and declared host actions', async () => {
  const db = new DataSource({ type: 'sqljs', entities: [WorkspaceRecord, LayoutProposal], synchronize: true })
  await db.initialize()
  try {
    const service = new DockyardWorkspaceService(db.getRepository(WorkspaceRecord))
    const provider = new DockyardWorkspaceViewProvider(service)
    const context: XpertResolvedViewHostContext = { ...scope, hostType: 'agent', hostId: scope.xpertId, slots: [] }
    const manifest = provider.getViewManifests(context, 'agent.workbench.fixed')[0]
    assert.deepEqual(manifest.activation?.requiredFeatures, [FEATURE])
    assert.deepEqual(manifest.actions?.map(action => action.key), [...ACTION_KEYS])
    const denied = await provider.executeViewAction(context, VIEW_KEY, 'content_create', { input: {} })
    assert.equal(denied.success, false)
    assert.equal((denied.data as {code:string}).code, 'not_found')
    assert.equal(manifest.view.type, 'remote_component')
    assert.deepEqual(manifest.clientCommands?.map(command => command.key), ['assistant.composer.append_references'])
    assert.deepEqual(provider.getViewManifests(context, 'unsupported.slot'), [])
    const middleware = new DockyardLayoutMiddleware(service)
    assert.equal(middleware.meta.name, MIDDLEWARE_NAME)
    assert.deepEqual(middleware.meta.features, [FEATURE])
    assert.deepEqual(middleware.getToolNames(), ['dockyard_edit_file'])
    assert.equal(middleware.getToolNames().some(name => name.includes('apply')), false)
    const app = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents?.find(item => item.type === 'app')
    assert.ok(app?.appConfig)
    assert.equal(plugin.templates?.filter(template => template.key === app.appConfig!.assistantTemplateKey).length, 1)
    const templateCard = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents?.find(item => item.type === 'assistant-template')
    assert.equal(templateCard?.name, app.appConfig.assistantTemplateKey)
    assert.equal(plugin.meta.level, 'tenant')
    const html = await provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: REMOTE_ENTRY })
    assert.equal(html.html.includes('dockyard-ai-open'), false)
    assert.equal(html.html.includes('dockyard-content-open'), false)
    assert.equal(html.html.includes('dockyard_read_content_request'), false)
    await assert.rejects(provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: '../../secret' }), /not_found/)
    const bad = await provider.executeViewAction(context, VIEW_KEY, 'save_scratchpad', { input: { expectedRevision: 0, text: 'text', tenantId: 'other' } })
    assert.equal(bad.success, false)
  } finally { await db.destroy() }
})

test('adapted sample preserves all original factories and rejects changed source anchors', async () => {
  const source = await readFile(new URL('../vendor/dockyard/sample/sample.js', import.meta.url), 'utf8')
  const adapted = adaptSample(source)
  assert.equal(/\blocalStorage\b|\bsessionStorage\b/.test(adapted), false)
  for (const match of source.matchAll(/factories\.set\('([^']+)'/g)) assert.ok(adapted.includes(match[0]))
  for (const method of ['PopOut', 'ShowNavigator', 'NewTabGroup', 'SaveLayout', 'LoadLayout', 'ShowMenu']) assert.ok(adapted.includes(method))
  assert.throws(() => adaptSample(source.replace('window.demo={manager,AD,applyPreset,', 'window.demo={}')), /anchor/)
  assert.deepEqual(Object.keys(catalogs['en-US']).sort(), Object.keys(catalogs['zh-Hans']).sort())
})
