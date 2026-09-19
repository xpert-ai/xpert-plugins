import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { JSDOM, VirtualConsole } from 'jsdom'
import { MockHost, scope, context, fixtureSummary } from './mock-host.mjs'
import plugin from '../dist/index.js'

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(check, description) {
  for (let i = 0; i < 250; i++) { if (check()) return; await pause(20) }
  assert.fail(`Timed out: ${description}`)
}
async function mount(host, { initialId, fastPoll = false } = {}) {
  const errors = [], envelope = { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'rfid-test' }
  let window
  const parent = { postMessage(message) {
    if (message.type === 'ready') setTimeout(() => emit({ type: 'init', initialQuery: { parameters: initialId ? { analysisId: initialId } : {} } }), 0)
    else if (message.requestId) void host.handle(message).then((response) => emit({ ...response, requestId: message.requestId })).catch((error) => emit({ type: 'error', message: error.message, requestId: message.requestId }))
  } }
  const emit = (message, options = {}) => window.dispatchEvent(new window.MessageEvent('message', { data: { ...envelope, ...message }, source: options.source ?? parent, origin: options.origin ?? 'https://mock.xpert.test' }))
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', (error) => errors.push(error))
  const dom = new JSDOM(await host.html(), { url: 'https://remote.xpert.test', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole,
    beforeParse(w) {
      window = w
      Object.defineProperty(w, 'parent', { value: parent })
      for (const storage of ['localStorage', 'sessionStorage']) Object.defineProperty(w, storage, { get() { throw new Error('Business data must not use browser storage') } })
      if (fastPoll) { const original = w.setInterval.bind(w); w.setInterval = (callback, delay) => original(callback, delay === 3000 ? 30 : delay) }
    }
  })
  host.emit = emit
  const doc = window.document
  const button = (label) => [...doc.querySelectorAll('button')].find((item) => item.textContent.includes(label))
  await until(() => button('Refresh') && !button('Refresh').disabled, 'connected UI')
  assert.deepEqual(errors, [])
  return {
    window, doc, button, errors, emit,
    async click(label) { const item = button(label); assert.ok(item, `Button ${label}`); assert.equal(item.disabled, false, `${label} enabled`); item.click(); await pause(0) },
    async choose(csv, name = 'experiment.csv') {
      const file = new window.File([csv], name, { type: 'text/csv' })
      file.arrayBuffer = async () => { const bytes = Buffer.from(csv); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }
      const input = doc.querySelector('input[type=file]')
      Object.defineProperty(input, 'files', { value: [file], configurable: true })
      input.dispatchEvent(new window.Event('change', { bubbles: true }))
      await pause(0)
    },
    close() { dom.window.close() }
  }
}

test('ViewProvider is registered, manifests declare Assistant/events, and packaged UI renders', async () => {
  const host = new MockHost()
  assert.deepEqual(plugin.meta.targetAppMeta['data-xpert'].runtime.viewProviders, ['rfid_experiment_insight'])
  const manifest = host.view.getViewManifests(context, 'agent.workbench.fixed')[0]
  assert.ok(manifest.clientCommands.some((item) => item.key === 'assistant.chat.send_message'))
  assert.ok(manifest.hostEvents.subscriptions[0].filter.toolNames.includes('save_analysis'))
  assert.equal(manifest.view.component.entry, 'rfid_experiment_insight__remote')
  const ui = await mount(host)
  try { assert.match(ui.doc.getElementById('root').textContent, /上传实验结果 CSV/); assert.equal(ui.button('上传并查看统计').disabled, true); assert.equal(host.messages.filter((item) => item.type === 'invokeClientCommand').length, 0) }
  finally { ui.close() }
})
test('real React upload validates via backend, displays statistics and dispatches Assistant exactly once', async () => {
  const host = new MockHost(), ui = await mount(host)
  try {
    await ui.choose(await readFile(new URL('../examples/experiment-results.csv', import.meta.url), 'utf8'))
    await ui.click('上传并查看统计')
    await until(() => ui.button('Analyze Experiment') && !ui.button('Analyze Experiment').disabled, 'DRAFT ready')
    assert.equal(host.repo.rows.size, 1)
    const record = [...host.repo.rows.values()][0], originalStats = structuredClone(record.statistics)
    assert.match(ui.doc.getElementById('root').textContent, /88\.50%/)
    assert.match(ui.doc.getElementById('root').textContent, /17\.90 个百分点/)
    const analyze = ui.button('Analyze Experiment'); analyze.click(); analyze.click()
    await until(() => host.messages.some((item) => item.type === 'invokeClientCommand'), 'Assistant command')
    await until(() => ui.doc.querySelector('main [data-status=ANALYZING]'), 'ANALYZING')
    assert.equal(host.messages.filter((item) => item.type === 'invokeClientCommand').length, 1)
    assert.equal(host.messages.filter((item) => item.actionKey === 'analyze_experiment').length, 1)
    const dispatch = host.messages.find((item) => item.type === 'invokeClientCommand')
    assert.equal(dispatch.commandKey, 'assistant.chat.send_message')
    assert.ok(dispatch.payload.text.includes(record.id))
    await host.finish()
    await until(() => ui.button('Confirm / Save'), 'tool event refresh')
    assert.ok(!ui.doc.getElementById('root').textContent.includes('正在等待解释结果'))
    for (const label of ['Overall Trend', 'Most Degraded Condition', 'Signal Quality Observation', 'Suggested Follow-up']) assert.ok(ui.doc.getElementById('root').textContent.includes(label))
    assert.equal(ui.button('Confirm / Save').disabled, true)
    assert.equal(record.confirmedAt, null)
    ui.doc.querySelector('input[type=checkbox]').click(); await pause(0)
    await ui.click('Confirm / Save')
    await until(() => record.confirmedAt && ui.doc.getElementById('root').textContent.includes('已人工确认并保存'), 'explicit human confirmation')
    assert.deepEqual(record.statistics, originalStats)
    assert.deepEqual(host.toolCalls.map((call) => call.name), ['analyze_experiment', 'save_analysis'])
  } finally { ui.close() }
})
test('invalid CSV shows backend field error without creating a record', async () => {
  const host = new MockHost(), ui = await mount(host)
  try {
    await ui.choose(await readFile(new URL('../examples/missing-column.csv', import.meta.url), 'utf8'))
    await ui.click('上传并查看统计')
    await until(() => ui.doc.querySelector('[role=alert]'), 'validation error')
    assert.match(ui.doc.querySelector('[role=alert]').textContent, /Missing required column: phase_dispersion/)
    assert.equal(host.repo.rows.size, 0)
    assert.equal(host.messages.filter((item) => item.type === 'invokeClientCommand').length, 0)
  } finally { ui.close() }
})
test('FAILED retains same analysis and statistics; Retry routes through Assistant then permits confirmation', async () => {
  const host = new MockHost(), record = await host.seed(), ui = await mount(host)
  try {
    await ui.click('Analyze Experiment')
    await until(() => host.attempt, 'attempt')
    const oldAttempt = { ...host.attempt }
    await host.finish('fail')
    await until(() => ui.button('Retry') && !ui.button('Retry').disabled, 'FAILED with Retry')
    assert.match(ui.doc.getElementById('root').textContent, /Assistant model failed/)
    assert.match(ui.doc.getElementById('root').textContent, /确定性统计/)
    await ui.click('Retry')
    await until(() => host.attempt.attemptId !== oldAttempt.attemptId, 'new attempt, same analysis')
    assert.equal(host.attempt.analysisId, record.id)
    assert.equal(host.repo.rows.size, 1)
    await assert.rejects(host.service.saveInterpretation(scope, oldAttempt, fixtureSummary))
    await host.finish('success')
    await until(() => ui.button('Confirm / Save'), 'retry completion')
    assert.deepEqual(host.repo.rows.get(record.id).statistics, record.statistics)
    assert.equal(host.repo.rows.get(record.id).confirmedAt, null)
  } finally { ui.close() }
})
test('failed Assistant dispatch is persisted and never reported as successfully sent', async () => {
  const host = new MockHost(); await host.seed(); host.dispatchFails = true
  const ui = await mount(host)
  try {
    await ui.click('Analyze Experiment')
    await until(() => ui.button('Retry'), 'dispatch FAILED')
    assert.ok(host.messages.some((item) => item.actionKey === 'report_dispatch_failure'))
    assert.ok(!ui.doc.getElementById('root').textContent.includes('请求已发送到 Assistant'))
    assert.equal(host.toolCalls.length, 0)
  } finally { ui.close() }
})
test('reopening restores persisted confirmation/history; switching history uses fresh query data', async () => {
  const host = new MockHost(), first = await host.seed('已确认实验')
  const attempt = await host.service.prepareAnalysis(scope, first.id)
  await host.service.saveInterpretation(scope, attempt, fixtureSummary)
  await host.service.confirmAnalysis(scope, first.id, true)
  const second = await host.seed('另一个实验')
  const ui = await mount(host, { initialId: first.id })
  try {
    assert.match(ui.doc.getElementById('root').textContent, /已人工确认并保存/)
    await ui.click('另一个实验')
    await until(() => ui.button('Analyze Experiment'), 'second record')
    assert.match(ui.doc.querySelector('main').textContent, /另一个实验/)
    await ui.click('已确认实验')
    await until(() => ui.doc.querySelector('main').textContent.includes('已人工确认并保存'), 'first record restored')
  } finally { ui.close() }
  const reopened = await mount(new MockHost(host.repo), { initialId: first.id })
  try { assert.match(reopened.doc.querySelector('main').textContent, /已人工确认并保存/); assert.ok(reopened.doc.getElementById('root').textContent.includes(fixtureSummary.overallTrend)); assert.equal(host.repo.rows.size, 2); assert.ok(second.id) }
  finally { reopened.close() }
})
test('polling recovers an expired attempt when no Assistant event arrives', async () => {
  const host = new MockHost(), record = await host.seed()
  await host.service.prepareAnalysis(scope, record.id)
  const ui = await mount(host, { fastPoll: true })
  try {
    assert.ok(ui.doc.querySelector('main [data-status=ANALYZING]'))
    host.repo.rows.get(record.id).attemptDeadline = '1'
    await until(() => ui.button('Retry'), 'poll discovers timeout')
    assert.match(ui.doc.getElementById('root').textContent, /timed out or was interrupted/)
  } finally { ui.close() }
})
test('stale history responses and messages from other frames cannot replace the current analysis', async () => {
  const host = new MockHost(), first = await host.seed('旧记录'), second = await host.seed('新记录')
  const ui = await mount(host, { initialId: second.id })
  try {
    const handle = host.handle.bind(host)
    let release
    host.handle = async (message) => {
      const result = await handle(message)
      if (message.type === 'requestData' && message.query.parameters.analysisId === first.id) await new Promise((resolve) => { release = resolve })
      return result
    }
    await ui.click('旧记录')
    await until(() => release, 'delayed query')
    await ui.click('新记录')
    await until(() => ui.doc.querySelector('main').textContent.includes('新记录'), 'new selection')
    release(); await pause(50)
    assert.match(ui.doc.querySelector('main').textContent, /新记录/)
    ui.emit({ type: 'init', initialQuery: { parameters: { analysisId: first.id } } }, { source: {} })
    await pause(20)
    assert.match(ui.doc.querySelector('main').textContent, /新记录/)
  } finally { ui.close() }
})
test('labels and AI text are rendered as text, never executable HTML', async () => {
  const host = new MockHost(), record = await host.seed('<img src=x onerror="window.pwned=1">')
  const attempt = await host.service.prepareAnalysis(scope, record.id)
  await host.service.saveInterpretation(scope, attempt, { ...fixtureSummary, overallTrend: '<script>window.pwned=1</script>' })
  const ui = await mount(host)
  try { assert.equal(ui.window.pwned, undefined); assert.equal(ui.doc.querySelectorAll('main img').length, 0); assert.ok(ui.doc.querySelector('main').textContent.includes('<script>window.pwned=1</script>')); assert.deepEqual(ui.errors, []) }
  finally { ui.close() }
})
