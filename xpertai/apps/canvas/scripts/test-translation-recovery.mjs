import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
const require = createRequire(import.meta.url)
const source = readFileSync(join(dirname(require.resolve('tldraw')), 'lib/ui/hooks/useTranslation/useTranslation.js'), 'utf8')
const settled = () => new Promise(resolve => setImmediate(resolve))

// Run the installed hook with controlled effects and fetches; no React DOM or network mocks can hide a rejected promise.
function fixture(fetchTranslation) {
  const window = new EventTarget(), states = [], effects = []
  const React = { createContext: () => ({ Provider: {} }), useState: init => [init(), value => states.push(value)],
    useEffect: effect => effects.push(effect) }
  const dependencies = { react: React, 'react/jsx-runtime': { jsx: () => null }, '@tldraw/editor': {},
    '../../context/asset-urls': { useAssetUrls: () => ({ translations: {} }) },
    './defaultTranslation': { DEFAULT_TRANSLATION: { save: 'Save' } }, './translations': { fetchTranslation } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'window', source)(name => {
    assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]
  }, module, module.exports, window)
  module.exports.TldrawUiTranslationProvider({ locale: 'zh-cn', children: null })
  return { window, states, cleanup: effects[0]() }
}
test('offline translation failure keeps current labels and retries once when online', async () => {
  let calls = 0
  const expected = { locale: 'zh-cn', messages: { save: '保存' } }
  const f = fixture(async () => { if (++calls === 1) throw new Error('offline'); return expected })
  await settled(); assert.equal(f.states.length, 0)
  f.window.dispatchEvent(new Event('online')); await settled()
  assert.equal(calls, 2); assert.deepEqual(f.states, [expected])
  f.cleanup(); f.window.dispatchEvent(new Event('online')); await settled(); assert.equal(calls, 2)
})
test('network events cannot duplicate an in-flight load or update a disposed editor', async () => {
  let calls = 0, resolve
  const pending = new Promise(done => { resolve = done })
  const f = fixture(() => { calls++; return pending })
  f.window.dispatchEvent(new Event('online')); f.window.dispatchEvent(new Event('online'))
  assert.equal(calls, 1); f.cleanup(); resolve({ locale: 'zh-cn', messages: {} }); await settled()
  assert.equal(f.states.length, 0)
})
