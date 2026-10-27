import assert from 'node:assert/strict'
import { before, test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
let script
before(async () => {
  const result = await build({ entryPoints: [resolve(root, 'remote-components/sites-workbench/src/main.tsx')], bundle: true,
    write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
    alias: { "@xpert-ai/plugin-shadcn-ui/i18n": resolve(root, "../../../packages/shadcn-ui/src/i18n.tsx"), '@xpert-ai/plugin-shadcn-ui': resolve(root, '../../../packages/shadcn-ui/src/index.ts'),
      react: require.resolve('react'), 'react-dom': require.resolve('react-dom'), 'react-dom/client': require.resolve('react-dom/client'),
      'react/jsx-runtime': require.resolve('react/jsx-runtime') } })
  script = result.outputFiles[0].text
})
async function until(check) {
  for (let n = 0; n < 150; n++) { if (check()) return; await delay(10) }
  assert.fail('Expected view state did not arrive')
}
function fixture(t) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { runScripts: 'dangerously', url: 'https://fixture.invalid' })
  t.after(() => dom.window.close())
  const w = dom.window
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  // Opaque-origin plugins must never depend on Web Storage.
  for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(w, key, { get() { throw new w.DOMException('Sandboxed', 'SecurityError') } })
  const id = '11111111-1111-4111-8111-111111111111', versionId = '22222222-2222-4222-8222-222222222222'
  const project = { id, name: 'Fixture site', slug: 'fixture', status: 'draft', audience: 'admins_only', updatedAt: '2026-10-12T00:00:00Z' }
  const detail = { project, versions: [{ id: versionId, versionNumber: 1, createdAt: project.updatedAt }], deployments: [], environmentValues: [] }
  const commands = [], requests = [], held = []
  let ready = false, hold = false, revision = 0
  const send = (type, payload = {}) => w.dispatchEvent(new w.MessageEvent('message', { source: w,
    data: { channel: 'xpertai.remote_component', protocolVersion: 1, type, instanceId: 'fixture', scopeRevision: revision, ...payload } }))
  w.postMessage = m => {
    if (m.type === 'ready') ready = true
    if (m.type === 'requestData') {
      requests.push(m.query)
      const data = m.query.parameters?.preview ? { meta: { previewHtml: '<h1>preview</h1>' } } : m.query.selectionId ? { meta: detail } : { items: [project], total: 1 }
      const reply = () => send('data', { requestId: m.requestId, data })
      if (hold && m.query.selectionId && !m.query.parameters?.preview) held.push(reply)
      else setTimeout(reply, 0)
    }
    if (m.type === 'invokeClientCommand') {
      commands.push(m)
      setTimeout(() => send('clientCommandResult', { requestId: m.requestId, result: { success: true } }), 0)
    }
  }
  w.eval(script)
  return { id, commands, requests, held, heading: () => w.document.querySelector('h1')?.textContent,
    ready: () => ready, hold: () => { hold = true },
    init: query => send('init', { locale: 'en-US', manifest: { key: 'sites' }, initialQuery: query }),
    context: () => { revision++; send('hostEvent', { event: { type: 'view.context.changed', data: { revision, runtimeScope: { projectId: null, conversationId: 'next' } } } }) } }
}

test('host list navigation clears selection/context; navigating back restores the site', async t => {
  const f = fixture(t); await until(f.ready)
  f.init({ selectionId: f.id, parameters: { tab: 'preview' } }); await until(() => f.heading() === 'Fixture site')
  f.commands.length = 0; f.requests.length = 0
  f.init({ parameters: { tab: 'preview' } }); await until(() => f.heading() === 'Sites')
  assert(f.commands.some(c => c.commandKey === 'assistant.context.set' && c.payload.key === 'sites' && c.payload.clear))
  assert(!f.requests.some(q => q.selectionId === f.id))
  f.init({ selectionId: f.id, parameters: { tab: 'preview' } }); await until(() => f.heading() === 'Fixture site')
  f.commands.length = 0
  f.context(); await until(() => f.commands.some(c => c.payload.context?.projectId === f.id))
  assert.equal(f.heading(), 'Fixture site')
  assert(!f.commands.some(c => c.payload.clear))
})

test('a delayed detail response cannot reopen a site after the host navigates to the list', async t => {
  const f = fixture(t); await until(f.ready); f.hold()
  f.init({ selectionId: f.id }); await until(() => f.held.length === 1)
  f.init({ parameters: { tab: 'preview' } }); await until(() => f.heading() === 'Sites')
  f.commands.length = 0; f.held[0](); await delay(50)
  assert.equal(f.heading(), 'Sites')
  assert(!f.commands.some(c => c.payload.context?.projectId === f.id))
})
