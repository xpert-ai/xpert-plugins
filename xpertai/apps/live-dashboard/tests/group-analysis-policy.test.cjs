const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')

test('analysis consent starts off, uses typed row restrictions, and resets for another version', async t => {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test' })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'IS_REACT_ACT_ENVIRONMENT']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] })
  }
  const uiRequire = createRequire(require.resolve('@xpert-ai/plugin-shadcn-ui'))
  const React = uiRequire('react'), { act } = React, { createRoot } = uiRequire('react-dom/client')
  const root = createRoot(dom.window.document.getElementById('root'))
  t.after(async () => {
    await act(async () => root.unmount())
    dom.window.close()
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
  })
  const ui = {
    Button: ({ variant, size, ...props }) => React.createElement('button', props),
    Checkbox: ({ onCheckedChange, ...props }) => React.createElement('input', { ...props, type: 'checkbox', onChange: e => onCheckedChange(e.target.checked) }),
    Input: props => React.createElement('input', props),
    Select: ({ onValueChange, ...props }) => React.createElement('select', { ...props, onChange: e => onValueChange(e.target.value) }),
    SelectTrigger: () => null, SelectValue: () => null,
    SelectContent: ({ children }) => children, SelectItem: props => React.createElement('option', props)
  }
  const bridge = { captureViewScope: () => () => {}, requestHost: async () => ({ success: true, data: [{
    key: 'stock', title: 'Stock', canShare: true, fields: [
      { id: 'active', label: 'Active', logicalType: 'boolean' }, { id: 'amount', label: 'Amount', logicalType: 'float64' }
    ]
  }] }) }
  const module = { exports: {} }
  const code = ts.transpileModule(readFileSync(require.resolve('../src/remote/group-analysis-policy.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true }
  }).outputText
  vm.runInNewContext(code, { exports: module.exports, require: id => id === 'react' ? React : id === '@xpert-ai/plugin-shadcn-ui' ? ui : id === './bridge' ? bridge : require(id) })
  const messages = require('../src/remote/locales/en.json'), states = []
  const props = { artifactId: 'artifact', versionId: 'v1', disabled: false, t: messages, onChange: (policy, ready) => states.push({ policy, ready }) }
  const render = async versionId => act(async () => root.render(React.createElement(module.exports.GroupAnalysisPolicy, { ...props, versionId })))
  const change = async (select, value) => act(async () => { select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  await render('v1')
  assert.deepEqual(states.at(-1), { policy: undefined, ready: true })
  await change(dom.window.document.querySelector('select'), 'explore')
  assert.equal(states.at(-1).ready, false)
  await act(async () => dom.window.document.querySelector('input[type=checkbox]').click())
  assert.equal(states.at(-1).ready, true)
  assert.equal(states.at(-1).policy.allowDetails, false)
  const add = [...dom.window.document.querySelectorAll('button')].find(button => button.textContent === messages.analysisAddFilter)
  await act(async () => add.click())
  assert.equal(states.at(-1).policy.datasets[0].filters[0].values[0], false)
  assert.equal(states.at(-1).ready, true)
  await change(dom.window.document.querySelectorAll('select')[1], 'amount')
  assert.equal(states.at(-1).policy.datasets[0].filters[0].values[0], '')
  assert.equal(states.at(-1).ready, false)
  assert.equal(dom.window.document.querySelector('input[aria-invalid]').getAttribute('aria-invalid'), 'true')
  await render('v2')
  assert.deepEqual(states.at(-1), { policy: undefined, ready: true })
})
