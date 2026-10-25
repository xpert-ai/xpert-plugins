import { test } from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import vm from 'node:vm'

const resourceId = 'cef1b690-fde3-4cc0-982a-e930e6206d8d'
const navigation = { target: 'workbench.view', viewKey: 'other-editor.views__document', selectionId: resourceId, parameters: { contentProvider: 'library' } }

// Exercise both real browser bridges. The editor key intentionally is not Markdown:
// resource-to-editor mapping belongs to the platform, not the plugin's UI.
for (const entry of ['remote/bridge.ts', '../markdown-editor/remote/bridge.ts']) {
  async function setup() {
    const bundle = await build({ entryPoints: [entry], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'bridge' })
    const sent: Array<{ type: string; commandKey?: string; requestId?: string; payload?: object }> = []
    let receive: (event: { source: object; data: object }) => void = () => undefined
    const parent = { postMessage: (message: typeof sent[number]) => sent.push(message) }
    const context = vm.createContext({ window: { parent, innerHeight: 800,
      addEventListener: (_: string, handler: typeof receive) => { receive = handler }, removeEventListener() {} },
      document: { documentElement: { style: { setProperty() {} }, dataset: {}, classList: { toggle() {} } },
        getElementById: () => ({ textContent: '' }), head: { appendChild() {} } }, setTimeout, clearTimeout, DOMException })
    vm.runInContext(bundle.outputFiles[0].text, context)
    vm.runInContext('bridge.connect(() => undefined)', context)
    const send = (data: object) => receive({ source: parent, data: { channel: 'xpertai.remote_component', protocolVersion: 1,
      instanceId: 'source-view', scopeRevision: 1, ...data } })
    send({ type: 'init' })
    return { sent, send, open: (): Promise<unknown> => vm.runInContext(`bridge.openDocument('${resourceId}')`, context) }
  }
  test(`${entry}: resolves first and opens the returned view through standard local navigation`, async () => {
    const { sent, send, open } = await setup()
    const pending = open()
    const resolve = sent.at(-1)!
    assert.equal(resolve.commandKey, 'workbench.content.resolve')
    send({ type: 'clientCommandResult', requestId: resolve.requestId, result: { success: true, navigation } })
    await new Promise<void>((done) => setImmediate(done))
    const navigate = sent.at(-1)!
    assert.equal(navigate.commandKey, 'workbench.navigation.open')
    assert.equal(JSON.stringify(navigate.payload), JSON.stringify(navigation))
    send({ type: 'clientCommandResult', requestId: navigate.requestId, result: { success: true, status: 'opened' } })
    await pending
    assert.ok(sent.every((request) => request.commandKey !== 'workbench.content.open'))
  })
  test(`${entry}: denied resolution does not navigate or fall back to a host open`, async () => {
    const { sent, send, open } = await setup()
    const pending = open(), failure = assert.rejects(pending, /forbidden/)
    send({ type: 'clientCommandResult', requestId: sent.at(-1)!.requestId, result: { success: false, code: 'forbidden' } })
    await failure
    assert.equal(sent.filter((request) => request.type === 'invokeClientCommand').length, 1)
  })
  test(`${entry}: rejects a different resource in the resolution`, async () => {
    const { sent, send, open } = await setup()
    const pending = open(), failure = assert.rejects(pending)
    send({ type: 'clientCommandResult', requestId: sent.at(-1)!.requestId,
      result: { success: true, navigation: { ...navigation, selectionId: 'different-resource' } } })
    await failure
    assert.equal(sent.filter((request) => request.type === 'invokeClientCommand').length, 1)
  })
  test(`${entry}: scope switch cancels resolution instead of navigating in the new project`, async () => {
    const { sent, send, open } = await setup()
    const pending = open(), failure = assert.rejects(pending, { name: 'AbortError' })
    const requestId = sent.at(-1)!.requestId
    send({ type: 'init', scopeRevision: 2 })
    send({ type: 'clientCommandResult', requestId, result: { success: true, navigation } })
    await failure
    assert.equal(sent.filter((request) => request.type === 'invokeClientCommand').length, 1)
  })
  test(`${entry}: unavailable local editor reports failure without escaping to the host`, async () => {
    const { sent, send, open } = await setup()
    const pending = open(), failure = assert.rejects(pending, /view_unavailable/)
    send({ type: 'clientCommandResult', requestId: sent.at(-1)!.requestId, result: { success: true, navigation } })
    await new Promise<void>((done) => setImmediate(done))
    send({ type: 'clientCommandResult', requestId: sent.at(-1)!.requestId, result: { success: false, code: 'view_unavailable' } })
    await failure
    assert.equal(sent.filter((request) => request.type === 'invokeClientCommand').length, 2)
  })
}
