import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'

const { outputFiles } = await build({
  stdin: {
    contents: "export * from './bridge'; export * from './assistant-request'",
    resolveDir: fileURLToPath(new URL('../src/lib/remote-components/resume_screening__remote/src/', import.meta.url))
  },
  bundle: true, write: false, format: 'iife', globalName: 'bridge',
  plugins: [{ name: 'theme-test-double', setup(builder) {
    builder.onResolve({ filter: /^@xpert-ai\/plugin-shadcn-ui$/ }, () => ({ path: 'theme', namespace: 'test' }))
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const installShadcnThemeVars = () => {}' }))
  } }]
})

function fixture(reply, options = {}) {
  let listener
  const parent = { postMessage(message) {
    const result = typeof reply === 'function' ? reply(message) : reply
    queueMicrotask(() => listener({ source: parent, data: { ...message, type: 'actionResult', result } }))
  } }
  const context = {
    console: { debug: (...args) => options.logs?.push(args) },
    window: { parent, addEventListener(_event, callback) { listener = callback }, removeEventListener() {}, setTimeout() {} },
    document: { documentElement: { classList: { toggle() {} }, dataset: {}, style: { setProperty() {} } } }
  }
  for (const target of [context, context.window]) {
    for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(target, key, {
      get() { throw new DOMException('Sandbox Web Storage is unavailable.', 'SecurityError') }
    })
  }
  runInNewContext(outputFiles[0].text, context)
  context.bridge.installBridgeListener({ onInit: options.onInit ?? (() => {}), onHostEvent() {} })
  context.bridge.initialize = (debug) => listener({ source: parent, data: { channel: 'xpertai.remote_component',
    protocolVersion: 1, type: 'init', instanceId: 'test-instance', locale: 'en', debug } })
  return context.bridge
}

test('a host actionResult with success:false rejects instead of reporting a saved record', async () => {
  const bridge = fixture({ success: false, message: { en_US: 'revision_conflict' } })
  await assert.rejects(bridge.executeAction('confirm_candidate', 'candidate'), /revision_conflict/)
})

test('successful create preserves the screening ID needed to select the new case', async () => {
  const bridge = fixture({ success: true, data: { screeningId: 'new-case' } })
  assert.equal((await bridge.executeAction('create_screening', '')).data.screeningId, 'new-case')
})

test('malformed action responses fail closed', async () => {
  await assert.rejects(fixture({}).executeAction('create_screening', ''), /Action failed/)
})

test('revision conflict classification survives localized text and ignores misleading text', async () => {
  await assert.rejects(
    fixture({ success: false, message: { zh_Hans: '记录已更新，请刷新' }, failure: { kind: 'business', code: 'revision_conflict' } })
      .executeAction('confirm_candidate', 'candidate'),
    (error) => error.code === 'revision_conflict'
  )
  for (const failure of [undefined, { kind: 'system', code: 'revision_conflict' }, { kind: 'business', code: 'other' }]) {
    await assert.rejects(
      fixture({ success: false, message: 'revision_conflict appears in display text', failure })
        .executeAction('confirm_candidate', 'candidate'),
      (error) => error.code === undefined
    )
  }
})

test('host client-command failures and malformed responses reject for retry', async () => {
  for (const response of [{ success: false, code: 'bad_request', message: 'Message text is required.' }, {}]) {
    await assert.rejects(fixture(response).sendScoringRequest({ screeningId: 'case-1', text: '评分 case-1' }))
  }
})

test('screening criteria lock keeps its typed code through the host bridge', async () => {
  await assert.rejects(fixture({ success: false, message: 'Conditions changed',
    failure: { kind: 'business', code: 'criteria_locked' } }).executeAction('update_screening', ''),
  (error) => error.code === 'criteria_locked')
})

test('the actual scoring request sends text and retries the same case after host rejection', async () => {
  const requests = []
  const bridge = fixture((message) => {
    requests.push(message)
    assert.equal(message.type, 'invokeClientCommand')
    assert.equal(message.commandKey, 'assistant.chat.send_message')
    assert.equal(message.payload.text, '请评分 case-1')
    assert.equal('message' in message.payload, false)
    return requests.length === 1
      ? { success: false, code: 'unsupported', message: 'Assistant ChatKit is not ready.' }
      : { success: true, status: 'sent' }
  })
  const request = { screeningId: 'case-1', text: '请评分 case-1' }
  await assert.rejects(bridge.sendScoringRequest(request), /not ready/)
  await bridge.sendScoringRequest(request)
  assert.deepEqual(requests[0].payload, requests[1].payload)
})

test('opaque-origin sandbox initializes with throwing Web Storage and debug disabled by default', async () => {
  const logs = []; let initialized = false
  const bridge = fixture({ success: true }, { logs, onInit() { initialized = true } })
  assert.doesNotThrow(() => bridge.initialize())
  await bridge.executeAction('confirm_candidate', 'fictional', { note: 'private note sentinel' })
  assert.equal(initialized, true)
  assert.equal(logs.length, 0)
})

test('debug obeys the host production flag and never includes payloads, identities or secrets', async () => {
  const logs = []
  const bridge = fixture({ success: true, data: { secret: 'response-private-sentinel' } }, { logs })
  bridge.initialize({ enabled: true, production: false })
  await bridge.executeAction('confirm_candidate', 'identity-private-sentinel', { note: 'resume-private-sentinel', token: 'token-private-sentinel' })
  assert.ok(logs.length >= 3)
  assert.match(JSON.stringify(logs), /confirm_candidate/)
  assert.doesNotMatch(JSON.stringify(logs), /private-sentinel/)
  logs.length = 0
  bridge.initialize({ enabled: true, production: true })
  await bridge.executeAction('confirm_candidate', 'fictional')
  assert.equal(logs.length, 0)
})
