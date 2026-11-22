import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND } from '@xpert-ai/contracts'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import plugin from '../dist/index.js'
import { PhotoIntakeMiddleware } from '../dist/lib/intake.middleware.js'
import { PhotoIntakeViewProvider } from '../dist/lib/intake-view.provider.js'
import {
  ACTION_KEYS,
  FEATURE,
  ANALYZE_CASE_TOOL,
  LIST_CASES_TOOL,
  LIST_RUNS_TOOL,
  GET_RUN_TOOL,
  EVALUATE_NEXT_TOOL,
  MIDDLEWARE_NAME,
  MUTATING_TOOLS,
  PLUGIN_NAME,
  PLUGIN_ARTIFACT_NAMESPACE,
  REMOTE_ENTRY,
  TEMPLATE_KEY,
  VIEW_KEY
} from '../src/lib/constants.js'
import { ASK_ASSISTANT_COMMAND } from '../src/lib/domain/case.js'
import { CATEGORY_IDS } from '../src/lib/domain/categories.js'
import { DEFAULT_PROMPT } from '../src/lib/domain/evaluation.js'
import en from '../src/lib/remote-components/workbench/locales/en.json' with { type: 'json' }
import zhHans from '../src/lib/remote-components/workbench/locales/zh-Hans.json' with { type: 'json' }
import { createService, newCase, scope } from './fixtures.js'

const context: XpertResolvedViewHostContext = { ...scope, hostType: 'agent', hostId: scope.xpertId, slots: [] }

test('the host can resolve the package through its require-based locator', () => {
  const hostRequire = createRequire(new URL('../package.json', import.meta.url))
  assert.equal(hostRequire.resolve(PLUGIN_NAME), fileURLToPath(new URL('../dist/index.js', import.meta.url)))
})

test('runtime metadata matches package.json and links one template to the app', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(plugin.meta.name, manifest.name)
  assert.equal(plugin.meta.version, manifest.version)
  assert.equal(plugin.meta.level, manifest.xpert.plugin.level)
  assert.equal(plugin.meta.artifactNamespace, manifest.xpert.plugin.artifactNamespace)
  assert.equal(PLUGIN_ARTIFACT_NAMESPACE, manifest.xpert.plugin.artifactNamespace, 'table names use the released namespace')

  const contents = plugin.meta.targetAppMeta?.xpert?.marketplace?.contents ?? []
  const app = contents.find(item => item.type === 'app')
  assert.equal(app?.appConfig?.assistantTemplateKey, TEMPLATE_KEY)
  assert.equal(plugin.templates?.filter(template => template.key === TEMPLATE_KEY).length, 1)
  assert.match(plugin.templates?.[0]?.dslContent ?? '', new RegExp(`provider: ${MIDDLEWARE_NAME}`))
  // The chat start screen shows the opener message, and falls back to the long description without one.
  assert.match(plugin.templates?.[0]?.dslContent ?? '', /\n {2}features:\n {4}opener:\n {6}enabled: true\n {6}message: 今天从哪里开始？\n/)
})

test('the view provider declares the workbench view, serves its bundle and rejects unknown keys', async () => {
  const { db, service, evaluations } = await createService()
  try {
    const provider = new PhotoIntakeViewProvider(service, evaluations)
    const manifest = provider.getViewManifests(context, 'agent.workbench.fixed')[0]
    assert.equal(manifest.key, VIEW_KEY)
    assert.deepEqual(manifest.activation?.requiredFeatures, [FEATURE])
    assert.deepEqual(manifest.actions?.map(action => action.key), [...ACTION_KEYS])
    assert.deepEqual(provider.getViewManifests(context, 'unsupported.slot'), [])
    // The view sends the chat command under the platform's key, and refreshes when the analysis tools finish.
    assert.equal(ASK_ASSISTANT_COMMAND, ASSISTANT_CHAT_SEND_MESSAGE_COMMAND)
    assert.deepEqual(manifest.clientCommands?.map(command => command.key), [ASSISTANT_CHAT_SEND_MESSAGE_COMMAND])
    assert.deepEqual(manifest.hostEvents?.subscriptions?.[0]?.filter?.toolNames, [...MUTATING_TOOLS])

    const data = await provider.getViewData(context, VIEW_KEY, { parameters: { caseId: '00000000-0000-4000-8000-000000000000' } })
    assert.equal((data.item as { selected: unknown }).selected, null, 'an unknown case is simply not selected')
    assert.deepEqual((data.item as { activePrompt: unknown }).activePrompt, { text: DEFAULT_PROMPT, source: { type: 'default' }, runTitle: null })

    const entry = await provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: REMOTE_ENTRY })
    assert.ok(entry.html.includes('xpertai.remote_component'), 'the bundled bridge is inlined')
    await assert.rejects(provider.getRemoteComponentEntry(context, VIEW_KEY, { isolation: 'iframe', entry: '../../secret' }), /not_found/)

    const unknown = await provider.executeViewAction(context, VIEW_KEY, 'delete_everything', { input: {} })
    assert.deepEqual(unknown, { success: false, data: { code: 'not_found' } })
    // Identity must come from the host context; extra fields in the input are refused.
    const spoofed = await provider.executeViewAction(context, VIEW_KEY, 'create_case', {
      input: { requestKey: '00000000-0000-4000-8000-000000000000', title: 'x', tenantId: 'other' }
    })
    assert.deepEqual(spoofed, { success: false, data: { code: 'invalid_input' } })

    // A person's confirmation goes through the view, on the revision they were looking at.
    const created = await service.createCase(scope, newCase())
    const stale = await provider.executeViewAction(context, VIEW_KEY, 'confirm_case', {
      input: { caseId: created.id, revision: created.revision + 1, categoryId: 'plumbing' }
    })
    assert.deepEqual(stale, { success: false, data: { code: 'conflict' } })
    const invented = await provider.executeViewAction(context, VIEW_KEY, 'confirm_case', {
      input: { caseId: created.id, revision: created.revision, categoryId: 'roof' }
    })
    assert.deepEqual(invented, { success: false, data: { code: 'invalid_input' } })
    const confirmed = await provider.executeViewAction(context, VIEW_KEY, 'confirm_case', {
      input: { caseId: created.id, revision: created.revision, categoryId: 'plumbing' }
    })
    assert.equal(confirmed.success, true)
    assert.equal((await service.getCase(scope, created.id)).confirmedCategoryId, 'plumbing')
  } finally {
    await db.destroy()
  }
})

test('the middleware exposes recognition and acceptance tools, never confirmation, review or result submission', async () => {
  const { db, service, analyzer, evaluations, runner } = await createService()
  try {
    const middleware = new PhotoIntakeMiddleware(service, analyzer, evaluations, runner)
    assert.equal(middleware.meta.name, MIDDLEWARE_NAME)
    assert.deepEqual(middleware.meta.features, [FEATURE])
    assert.deepEqual(middleware.getToolNames(), [LIST_CASES_TOOL, ANALYZE_CASE_TOOL, LIST_RUNS_TOOL, GET_RUN_TOOL, EVALUATE_NEXT_TOOL])
    assert.deepEqual([...MUTATING_TOOLS], [ANALYZE_CASE_TOOL, EVALUATE_NEXT_TOOL])
    assert.equal(new Set(CATEGORY_IDS).size, CATEGORY_IDS.length)
    assert.ok(CATEGORY_IDS.includes('unclear'), 'the model always has a way to decline')
  } finally {
    await db.destroy()
  }
})

test('both locale catalogs define the same keys', () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(zhHans).sort())
})
