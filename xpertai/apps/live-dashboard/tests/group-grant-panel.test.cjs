const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')

test('failed authorization loading shows a retry error, not an empty group hint, and recovers on refresh', async t => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'DocumentFragment', 'Node', 'Element', 'Event', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] })
  }
  const uiRequire = createRequire(require.resolve('@xpert-ai/plugin-shadcn-ui'))
  const React = uiRequire('react'), { act } = React, { createRoot } = uiRequire('react-dom/client')
  const ui = await import('@xpert-ai/plugin-shadcn-ui')
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  let fail = true
  const calls = []
  const bridge = {
    captureViewScope: () => () => {},
    requestHost: async (kind, request) => {
      calls.push({ kind, request })
      return fail ? { success: false, code: 'navigation_failed' } : { success: true, data: { items: [], nextOffset: null } }
    }
  }
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(require.resolve('../src/remote/group-grant-panel.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText
  vm.runInNewContext(code, { exports: module.exports, require: id => id === 'react' ? React : id === '@xpert-ai/plugin-shadcn-ui' ? ui : id === './bridge' ? bridge : id === './group-analysis-policy' ? { GroupAnalysisPolicy: () => null } : require(id) })
  const messages = require('../src/remote/locales/en.json')
  await act(async () => root.render(React.createElement(module.exports.GroupGrantPanel, {
    artifactId: 'cef1b690-fde3-4cc0-982a-e930e6206d8d', versions: [], t: messages
  })))
  assert.equal(dom.window.document.querySelector('[role="alert"]').textContent, messages.groupGrantError)
  assert.ok(!dom.window.document.body.textContent.includes(messages.groupGrantNoTargets))
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.kind === 'invokeClientCommand' && call.request.commandKey === 'artifact.use-grants.manage'))

  fail = false
  const refresh = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === messages.refresh)
  await act(async () => refresh.click())
  assert.equal(dom.window.document.querySelector('[role="alert"]'), null)
  assert.ok(dom.window.document.body.textContent.includes(messages.groupGrantNoTargets))
  assert.equal(calls.length, 4)
})
