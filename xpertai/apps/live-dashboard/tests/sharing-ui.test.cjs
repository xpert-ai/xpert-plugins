const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')

// Real React 18 shared controls and ShareDialog; clipboard behavior is simulated, not browser acceptance.
async function setup(t) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'HTMLSelectElement', 'NodeFilter', 'DocumentFragment', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'Node', 'Element', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  previous.set('IS_REACT_ACT_ENVIRONMENT', Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const uiRequire = createRequire(require.resolve('@xpert-ai/plugin-shadcn-ui'))
  const React = uiRequire('react'), { act } = React
  const ui = await import('@xpert-ai/plugin-shadcn-ui'), i18nUi = await import('@xpert-ai/plugin-shadcn-ui/i18n')
  const root = uiRequire('react-dom/client').createRoot(document.getElementById('root'))
  const url = 'https://platform.test/artifacts/view/abc?token=exact%2Bvalue&version=1'
  const state = { published: { versionId: 'v1', versionNumber: 1, title: 'Dashboard' }, issues: [],
    link: { status: 'active', versionMode: 'latest', url } }
  let clipboard = '', copyMode = 'success', copyCalls = 0, releaseRevoke
  document.execCommand = command => {
    assert.equal(command, 'copy')
    copyCalls++
    if (copyMode === 'throw') throw Error('Clipboard denied')
    if (copyMode === 'denied') return false
    const input = document.activeElement
    clipboard = input instanceof dom.window.HTMLInputElement
      ? input.value.slice(input.selectionStart, input.selectionEnd) : document.getSelection().toString()
    return true
  }
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const api = {}; modules.set(name, api)
    const path = require.resolve(`../src/remote/${name}`)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports: api, document: dom.window.document, console,
      require: id => {
        if (id === 'react') return React
        if (id === '@xpert-ai/plugin-shadcn-ui') return ui
        if (id === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
        if (id === './group-grant-panel') return { GroupGrantPanel: () => null }
        if (id === './i18n') return load('i18n.ts')
        if (id.startsWith('./locales/')) return require(`../src/remote/${id}`)
        if (id === './bridge') return { requestHost: async (kind, request) => {
          assert.equal(kind, 'executeAction')
          assert.equal(request.input.artifactId, 'dashboard')
          if (request.actionKey === 'revoke-share') {
            await new Promise(resolve => { releaseRevoke = resolve })
            return { success: true, data: { ...state, link: null } }
          }
          assert.equal(request.actionKey, 'share-status')
          return { success: true, data: state }
        } }
        return require(id)
      }
    }, { filename: path })
    return api
  }
  const render = async element => { await act(async () => root.render(element)) }
  const button = label => [...document.querySelectorAll('button')].find(element => element.textContent === label)
  const click = async element => { assert.ok(element); await act(async () => element.click()) }
  const input = () => document.getElementById('dashboard-share-url')
  async function share(locale = 'en') {
    await render(null)
    copyMode = 'success'; clipboard = 'previous clipboard'; copyCalls = 0
    const messages = load('i18n.ts').messages(locale)
    await render(React.createElement(load('share-dialog.tsx').ShareDialog, {
      artifactId: 'dashboard', versionId: 'v1', versions: [{ versionId: 'v1', versionNumber: 1 }], t: messages, onClose() {}
    }))
    assert.ok(input())
    return messages
  }
  t.after(async () => {
    await act(async () => root.unmount())
    // Radix restores focus asynchronously; finish that cleanup before restoring DOM globals.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return { React, ui, render, share, click, button, input, url,
    clipboard: () => clipboard, copyCalls: () => copyCalls,
    failCopy: mode => { copyMode = mode },
    releaseRevoke: async () => { await act(async () => releaseRevoke()) }
  }
}

test('shared Input refs and share-link copying', async t => {
  const app = await setup(t)
  await t.test('forwards object and callback refs to the native input under React 18', async () => {
    assert.match(app.React.version, /^18\./)
    const ref = app.React.createRef(), callbacks = []
    await app.render(app.React.createElement(app.ui.Input, { ref, value: 'select me', readOnly: true, 'aria-label': 'Ref input' }))
    const native = document.querySelector('input')
    assert.equal(ref.current, native)
    ref.current.focus(); ref.current.select()
    assert.equal(document.activeElement, native)
    assert.equal(native.value.slice(native.selectionStart, native.selectionEnd), 'select me')
    await app.render(null)
    assert.equal(ref.current, null)
    await app.render(app.React.createElement(app.ui.Input, { ref: node => callbacks.push(node), defaultValue: 'callback' }))
    assert.equal(callbacks[0], document.querySelector('input'))
    await app.render(null)
    assert.equal(callbacks.at(-1), null)
  })
  await t.test('first click copies the exact URL despite unrelated selection and clipboard contents', async () => {
    const labels = await app.share()
    const unrelated = document.createElement('span')
    unrelated.textContent = 'unrelated selected text'
    document.querySelector('[role="dialog"]').append(unrelated)
    const range = document.createRange(); range.selectNodeContents(unrelated)
    document.getSelection().removeAllRanges(); document.getSelection().addRange(range)
    app.input().setSelectionRange(3, 7)
    assert.equal(app.clipboard(), 'previous clipboard')
    await app.click(app.button(labels.copyLink))
    assert.equal(app.clipboard(), app.url)
    assert.equal(app.copyCalls(), 1)
    assert.ok(app.button(labels.copied))
    assert.equal(document.querySelector('[role="alert"]'), null)
    unrelated.remove()
  })
  for (const locale of ['en', 'zh-Hans', 'zh-Hant']) {
    await t.test(`denied copy shows localized manual-copy feedback and can retry (${locale})`, async () => {
      const labels = await app.share(locale)
      app.failCopy('denied')
      await app.click(app.button(labels.copyLink))
      assert.equal(app.clipboard(), 'previous clipboard')
      assert.equal(app.button(labels.copied), undefined)
      assert.equal(document.querySelector('[role="alert"]').textContent, labels.copyLinkFailed)
      assert.equal(app.input().value.slice(app.input().selectionStart, app.input().selectionEnd), app.url)
      assert.equal(app.input().disabled, false)
      app.failCopy('success')
      await app.click(app.button(labels.copyLink))
      assert.equal(app.clipboard(), app.url)
      assert.ok(app.button(labels.copied))
      assert.equal(document.querySelector('[role="alert"]'), null)
    })
  }
  await t.test('an exception after a successful copy clears the previous success', async () => {
    const labels = await app.share()
    await app.click(app.button(labels.copyLink))
    app.failCopy('throw')
    await app.click(app.button(labels.copied))
    assert.equal(app.button(labels.copied), undefined)
    assert.equal(document.querySelector('[role="alert"]').textContent, labels.copyLinkFailed)
  })
  await t.test('does not copy when selecting the full URL fails', async () => {
    const labels = await app.share()
    app.input().setSelectionRange(1, 2)
    app.input().select = () => {}
    await app.click(app.button(labels.copyLink))
    assert.equal(app.copyCalls(), 0)
    assert.equal(app.clipboard(), 'previous clipboard')
    assert.equal(document.querySelector('[role="alert"]').textContent, labels.copyLinkFailed)
  })
  await t.test('copy is unavailable while the link is being revoked', async () => {
    const labels = await app.share()
    await app.click(app.button(labels.revokeShare))
    assert.equal(app.button(labels.copyLink).disabled, true)
    await app.click(app.button(labels.copyLink))
    assert.equal(app.copyCalls(), 0)
    await app.releaseRevoke()
    assert.equal(app.input(), null)
  })
})
