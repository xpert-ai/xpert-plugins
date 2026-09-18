import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const handlers = {}, sent = []
const parent = { postMessage: (data, origin) => sent.push({ data, origin }) }
const window = { __GEO_PARENT_ORIGINS: ['http://localhost:8088'], addEventListener: (key, value) => { handlers[key] = value } }
vm.runInNewContext(await readFile(new URL('../src/lib/remote-components/geo-intelligence/bridge.js', import.meta.url), 'utf8'), {
  window, parent, document: { referrer: 'http://localhost:8088/', documentElement: { lang: 'zh-Hans' } },
  URL, Map, Set, Promise, Error, setTimeout, clearTimeout
})
const init = { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'init', instanceId: 'i' }
handlers.message({ source: {}, origin: 'http://localhost:8088', data: init })
assert.equal(window.GeoBridge.ready(), false)
handlers.message({ source: parent, origin: 'https://evil.example', data: init })
assert.equal(window.GeoBridge.ready(), false)
handlers.message({ source: parent, origin: 'http://localhost:8088', data: init })
assert.equal(window.GeoBridge.ready(), true)
const result = window.GeoBridge.request('requestData', {})
assert.equal(sent.at(-1).origin, 'http://localhost:8088')
const reply = { ...init, type: 'response', requestId: sent.at(-1).data.requestId, data: { items: [] } }
handlers.message({ source: parent, origin: 'http://localhost:8088', data: reply })
assert.deepEqual((await result).data, { items: [] })
window.GeoBridge.announce()
assert.ok(sent.every(message => message.origin !== '*'))
console.log('PASS: source/origin spoof rejection, handshake, response correlation, exact target origin')
