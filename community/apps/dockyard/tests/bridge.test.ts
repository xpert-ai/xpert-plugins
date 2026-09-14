import test from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod/v3'
import { HostBridge } from '../src/lib/remote/bridge.js'

test('bridge validates parent, channel, instance and response; assistant failures are not reported as sent', async () => {
  const sent: { type: string; requestId?: string; commandKey?: string; payload?: unknown }[] = []
  let listener: ((event: MessageEvent) => void) | null = null
  const parent = { postMessage: (value: typeof sent[number]) => { sent.push(value) } }
  const surface = {
    parent,
    addEventListener: (_name: string, callback: (event: MessageEvent) => void) => { listener = callback },
    removeEventListener: () => { listener = null }
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { value: surface, configurable: true })
  const bridge = new HostBridge()
  const emit = (data: object, source: object = parent) => {
    const event = new MessageEvent('message', { data })
    Object.defineProperty(event, 'source', { value: source })
    listener?.(event)
  }
  const envelope = { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'host-one' }
  try {
    const connected = bridge.connect()
    emit({ ...envelope, type: 'init', locale: 'zh-Hans' }, {})
    emit({ ...envelope, channel: 'wrong', type: 'init' })
    emit({ ...envelope, type: 'init', locale: 'zh-Hans' })
    assert.deepEqual(await connected, { locale: 'zh-Hans' })
    const data = bridge.query(z.object({ revision: z.number() }))
    const requestId = sent.at(-1)!.requestId
    let resolved = false; void data.then(() => { resolved = true })
    emit({ ...envelope, instanceId: 'stale', type: 'data', requestId, data: { item: { revision: 999 } } })
    await Promise.resolve(); assert.equal(resolved, false)
    emit({ ...envelope, type: 'data', requestId, data: { item: { revision: 2 } } })
    assert.deepEqual(await data, { revision: 2 })
    const references = [{ type: 'code' as const, path: 'theme.css', text: '  color: red;\n', startLine: 2, endLine: 2 }]
    const append = bridge.appendReferences(references)
    assert.equal(sent.at(-1)!.commandKey, 'assistant.composer.append_references')
    assert.deepEqual(sent.at(-1)!.payload, { references })
    emit({ ...envelope, type: 'clientCommandResult', requestId: sent.at(-1)!.requestId, result: { success: true, status: 'appended', focused: false } })
    assert.deepEqual(await append, { success: true, focused: false })
    const unsupported = bridge.appendReferences(references)
    emit({ ...envelope, type: 'clientCommandResult', requestId: sent.at(-1)!.requestId, result: { success: false, code: 'unsupported' } })
    await assert.rejects(unsupported, /composer_unavailable/)
    const save = bridge.action('save_workspace', {}, z.object({ revision: z.number() }))
    emit({ ...envelope, type: 'actionResult', requestId: sent.at(-1)!.requestId, result: { success: false, data: { code: 'conflict' } } })
    await assert.rejects(save, /conflict/)
    const pending = bridge.query(z.object({ revision: z.number() }))
    bridge.dispose()
    await assert.rejects(pending, /view_closed/)
  } finally {
    bridge.dispose()
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
