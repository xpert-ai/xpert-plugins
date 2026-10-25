import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'

test('repeated host init preserves in-flight actions; scope change cancels them and ignores stale replies', async () => {
  const bundle = await build({ entryPoints: ['remote/bridge.ts'], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'bridge' })
  const sent: Array<Record<string, unknown>> = []
  let receive: ((event: { source: object; data: object }) => void) | undefined
  const parent = { postMessage: (message: Record<string, unknown>) => sent.push(message) }
  const sandbox = {
    window: { parent, innerHeight: 800, addEventListener: (_: string, handler: typeof receive) => { receive = handler }, removeEventListener() {} },
    document: { documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} } },
      getElementById: () => ({ textContent: '' }), createElement: () => ({ textContent: '' }), head: { appendChild() {} } },
    setTimeout, clearTimeout, DOMException
  }
  const context = vm.createContext(sandbox)
  vm.runInContext(bundle.outputFiles[0].text, context)
  vm.runInContext('var initCount = 0; bridge.connect(() => initCount++)', context)
  const send = (data: object) => receive?.({ source: parent, data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'view', scopeRevision: 1, ...data } })
  send({ type: 'init' })
  const pending: Promise<unknown> = vm.runInContext("bridge.action('page.read', { itemId: 'page' })", context)
  const request = sent.find(m => m.type === 'executeAction')
  send({ type: 'init', theme: { mode: 'dark' } })
  assert.equal(vm.runInContext('initCount', context), 1)
  send({ type: 'actionResult', requestId: request?.requestId, result: { success: true, data: 'saved' } })
  assert.equal(await pending, 'saved')
  const cancelled: Promise<unknown> = vm.runInContext("bridge.action('page.read', { itemId: 'page' })", context)
  const rejection = assert.rejects(cancelled, { name: 'AbortError' })
  send({ type: 'init', scopeRevision: 2 }); await rejection
  assert.equal(vm.runInContext('initCount', context), 2)
})
