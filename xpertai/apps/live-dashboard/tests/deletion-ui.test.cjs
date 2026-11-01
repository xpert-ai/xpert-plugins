const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { randomUUID } = require('node:crypto')
const vm = require('node:vm')
const ts = require('typescript')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const example = require('../examples/postgres-sales.json')

// Exercise the real picker/dialog and App with an in-memory host, without opening a browser.
async function setup(t) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>', { url: 'https://view.test', pretendToBeVisual: true })
  const previous = new Map()
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'HTMLButtonElement', 'NodeFilter', 'DocumentFragment', 'SVGElement', 'HTMLSelectElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'Node', 'Element', 'CustomEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: dom.window[key] })
  }
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  dom.window.HTMLElement.prototype.scrollIntoView = function () {}
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'), { act } = React
  const ui = await import('@xpert-ai/plugin-shadcn-ui'), i18nUi = await import('@xpert-ai/plugin-shadcn-ui/i18n')
  const { createRoot } = require('react-dom/client')
  let root, ready, created, scopeReset, rejectDelete = false, releaseDelete, holdOpen = false, releaseOpen
  const calls = [], navigation = [], selections = []
  const projects = [{ id: randomUUID(), name: 'Project A' }, { id: randomUUID(), name: 'Project B' }]
  let currentProject = projects[0], navigationSuccess = true
  const projectNavigation = []
  let viewMode = 'draft'; const versionId = randomUUID()
  const items = [1, 2].map(n => ({ artifactId: randomUUID(), title: `Dashboard ${n}`, draftRevision: n,
    canDelete: true, isDraft: true, updatedAt: `2026-10-2${n}T01:00:00Z`,
    manifest: { ...example, id: randomUUID(), title: `Dashboard ${n}`, bindings: [], charts: [], tables: [], controls: [] } }))
  let dashboards = [...items], pickerProjects, pickerDashboards
  const pickerRequests = []
  const bridge = {
    startBridge: (callback, onCreated, onReset) => { ready = callback; created = onCreated; scopeReset = onReset; return () => {} },
    onPrepareClose: () => () => {}, isViewVisible: () => true,
    selectDashboard: async target => { selections.push(target) },
    navigateDashboard: async (_target, id) => { navigation.push(id) },
    requestHost: async (kind, request) => {
      if (kind === 'requestData') {
        const id = request.query.parameters.artifactId
        const mode = request.query.parameters.mode ?? viewMode
        const saved = dashboards.find(item => item.artifactId === id) ?? dashboards[0]
        const response = { meta: { currentProject, dashboards, sources: [], access: { project: false, canEdit: true, canManage: true, canReadDraft: true, archived: false }, mode, navigationTarget: { target: 'workbench.view', viewKey: 'live-dashboard__live-dashboard' },
          ...(id || dom.window.__DASHBOARD_READ_ONLY__ ? { saved: mode === 'published' ? { ...saved, isDraft: false, versionId, versionNumber: 1, draftRevision: undefined } : saved, versions: [] } : {}) } }
        if (id && holdOpen) {
          holdOpen = false
          await new Promise(resolve => { releaseOpen = resolve })
        }
        return response
      }
      if (kind === 'invokeClientCommand' && request.commandKey === 'workbench.navigation.open') { projectNavigation.push(request.payload); return { success: navigationSuccess } }
      if (kind === 'executeAction' && ['projects', 'dashboards'].includes(request.actionKey)) {
        pickerRequests.push(request)
        const {search, page} = request.input
        const source = request.actionKey === 'projects' ? pickerProjects ?? projects : pickerDashboards ?? dashboards
        const matches = source.filter(item => `${item.name ?? item.title ?? ''}`.toLowerCase().includes(search.toLowerCase()))
        return { success: true, data: { items: matches.slice((page - 1) * 20, page * 20), page, hasMore: matches.length > page * 20 } }
      }
      if (kind === 'executeAction') {
        calls.push(request)
        assert.equal(request.actionKey, 'delete')
        if (rejectDelete) throw Error('ARTIFACT_DRAFT_CONFLICT')
        await new Promise(resolve => { releaseDelete = resolve })
        dashboards = dashboards.filter(item => item.artifactId !== request.input.artifactId)
        return { success: true, data: { artifactId: request.input.artifactId } }
      }
      return { success: true }
    }
  }
  const modules = new Map()
  function load(name) {
    if (modules.has(name)) return modules.get(name)
    const api = {}; modules.set(name, api)
    const path = require.resolve(`../src/remote/${name}`)
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
      // Match the remote bundle's classic JSX transform, including its React import requirement.
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true
    } }).outputText
    vm.runInNewContext(code, { exports: api, window: dom.window, document: dom.window.document, console, Error,
      require: id => {
        if (id === '@xpert-ai/plugin-shadcn-ui') return ui
        if (id === '@xpert-ai/plugin-shadcn-ui/i18n') return i18nUi
        if (id === '@xpert-ai/plugin-sdk/artifact-document') return { installArtifactDocumentFramePolicy() {} }
        if (id === 'react-dom/client') return { createRoot: element => { root = createRoot(element); return root } }
        if (id === './bridge') return bridge
        if (id.endsWith('.css')) return {}
        if (id === './html-dashboard') return { HtmlDashboard: React.forwardRef(() => null) }
        if (id === './share-dialog') return { ShareDialog: () => null }
        if (id === './viewer-controls') return { ViewerControls: ({ children }) => children }
        if (id === './i18n') return load('i18n.ts')
        if (id === './toolbar-menu') return load('toolbar-menu.tsx')
        if (id === './dashboard-picker') return load('dashboard-picker.tsx')
        if (id.startsWith('./locales/')) return require(`../src/remote/${id}`)
        return require(id.startsWith('../lib/') ? id.replace('../lib/', '../dist/lib/') : id)
      }
    }, { filename: path })
    return api
  }
  const flush = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  const click = async element => { assert.ok(element); await act(async () => { if (element.matches('[data-slot=dropdown-menu-trigger]')) element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); else element.click() }); await flush() }
  const button = label => [...document.querySelectorAll('button,[role=menuitem],[role=menuitemradio]')].find(element => element.getAttribute('aria-label') === label || element.textContent === label)
  const picker = () => document.querySelector('[aria-label="Select project and dashboard"]')
  const dialog = () => document.querySelector('[role="alertdialog"]')
  t.after(async () => {
    await act(async () => root?.unmount()); await flush(); dom.window.close()
    for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key] }
    delete globalThis.ResizeObserver; delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })
  async function reset(readOnly = false, mode = 'draft') {
    viewMode = mode
    await act(async () => root?.unmount())
    modules.clear(); dashboards = [...items]; calls.length = 0; navigation.length = 0; selections.length = 0
    pickerProjects = undefined; pickerDashboards = undefined; pickerRequests.length = 0
    rejectDelete = false; holdOpen = false; currentProject = projects[0]; projectNavigation.length = 0; navigationSuccess = true
    dom.window.__DASHBOARD_READ_ONLY__ = readOnly
    document.body.innerHTML = '<div id="root"></div>'
    await act(async () => load('main.tsx'))
    await act(async () => ready('en-US', readOnly ? {} : { selectionId: items[0].artifactId }))
    await flush()
  }
  return { reset, projects, projectNavigation, pickerRequests,
    setPickerFixtures: (p, d) => { pickerProjects = p; pickerDashboards = d },
    fill: async (label, value) => {
      const input = document.querySelector(`input[aria-label="${label}"]`)
      await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 250)) })
    },
    failNavigation: () => { navigationSuccess = false },
    hostProjectChange: async () => { currentProject = projects[1]; dashboards = []; await act(async () => { scopeReset(); ready('en-US', { parameters: { picker: 'dashboards' } }) }); await flush() },
    items, versionId, calls, navigation, selections, click, button, picker, dialog,
    failDelete: value => { rejectDelete = value },
    finishDelete: async () => { await act(async () => releaseDelete()); await flush() },
    notify: async (id, hold = false) => { holdOpen = hold; await act(async () => created(id)); await flush() },
    finishOpen: async () => { await act(async () => releaseOpen()); await flush() },
    remaining: () => dashboards
  }
}

test('dashboard deletion UI', async t => {
  const harness = await setup(t)
  await t.test('project selector requests host navigation and follows authoritative scope changes', async () => {
    await harness.reset()
    const projectPicker = harness.picker
    assert.match(projectPicker().textContent, /Project A/)
    for (const name of ['Copy to project', 'Production and review', 'Recycle bin', 'View published']) assert.equal(harness.button(name), undefined)
    await harness.click(projectPicker())
    await harness.click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === 'Project B'))
    assert.equal(harness.projectNavigation.at(-1).projectId, harness.projects[1].id)
    assert.equal(harness.projectNavigation.at(-1).target, 'assistant.project')
    assert.equal(harness.projectNavigation.at(-1).selectionId, undefined)
    assert.match(projectPicker().textContent, /Project A/, 'no optimistic project change before host authorization')
    await harness.hostProjectChange()
    assert.match(projectPicker().textContent, /Project B/)
    assert.doesNotMatch(harness.picker().textContent, /Dashboard 1/)
    await harness.click(harness.button('New dashboard'))
    assert.equal(harness.projectNavigation.length, 1, 'selection/new navigation must not race a separate picker-dismiss navigation')
    assert.equal(harness.navigation.at(-1), undefined)
  })
  await t.test('failed project navigation preserves the active project and dashboard', async () => {
    await harness.reset(); harness.failNavigation()
    await harness.click(harness.picker())
    await harness.click([...document.querySelectorAll('[role="option"]')].find(item => item.textContent === 'Project B'))
    assert.match(document.querySelector('[role="alert"]').textContent, /Could not switch project/)
    assert.match(harness.picker().textContent, /Dashboard 1/)
    assert.match(harness.picker().textContent, /Project A/)
  })
  await t.test('published selection reaches Assistant context and editing selects its draft', async () => {
    await harness.reset(false, 'published')
    assert.deepEqual(JSON.parse(JSON.stringify(harness.selections.at(-1))), { artifactId: harness.items[0].artifactId, versionId: harness.versionId })
    await harness.click(harness.button('More actions')); await harness.click(harness.button('Edit working draft'))
    assert.deepEqual(JSON.parse(JSON.stringify(harness.selections.at(-1))), { artifactId: harness.items[0].artifactId, draftRevision: harness.items[0].draftRevision })
  })
  await t.test('authenticated share opens the host-resolved target without editor context or navigation', async () => {
    await harness.reset(true)
    assert.equal(document.querySelector('h1').textContent, harness.items[0].title)
    assert.equal(harness.picker(), null)
    assert.deepEqual(harness.selections, [])
    assert.deepEqual(harness.navigation, [])
  })
  await t.test('search and new dashboard are inside the cascade; extra operations are in More', async () => {
    await harness.reset()
    assert.equal(harness.button('New dashboard'), undefined)
    assert.equal(harness.button('Edit working draft'), undefined)
    assert.equal(harness.button('Import definition'), undefined)
    assert.doesNotMatch(document.querySelector('header').textContent, /Editing Dashboard/)
    assert.match(document.querySelector('header').textContent, /Draft r1/)
    await harness.click(harness.picker())
    assert.ok(document.querySelector('input[placeholder="Search dashboards…"]'))
    assert.ok(harness.button('New dashboard'))
    await harness.click(harness.button('New dashboard'))
    assert.match(harness.picker().textContent, /Project A/)
    assert.match(harness.picker().textContent, /Choose a dashboard/)
    assert.equal(harness.selections.at(-1), null)
    await harness.click(harness.button('More actions'))
    assert.ok(harness.button('Import definition'))
    assert.equal(harness.button('Delete dashboard'), undefined)
  })
  await t.test('two columns search and paginate independently and keep the active project highlighted', async () => {
    await harness.reset()
    const projects = [...harness.projects, ...Array.from({length: 20}, (_, i) => ({id: randomUUID(), name: `Extra project ${i}`}))]
    const dashboards = Array.from({length: 23}, (_, i) => ({artifactId: randomUUID(), title: `Board ${String(i).padStart(2, '0')}`}))
    harness.setPickerFixtures(projects, dashboards)
    await harness.click(harness.picker())
    assert.ok(document.querySelector('section[aria-label="Project"] input[aria-label="Search projects"]'))
    assert.ok(document.querySelector('section[aria-label="Dashboards"] input[aria-label="Search dashboards…"]'))
    assert.match(document.querySelector('[data-current=true]').textContent, /Project A/)
    assert.equal(document.querySelector('[data-current=true]').getAttribute('aria-current'), 'true')
    assert.match(document.querySelector('section[aria-label=Project] [aria-selected=true]').textContent, /Project A/)
    const pager = label => document.querySelector(`[role=group][aria-label="${label}"]`)
    const next = label => pager(label).querySelector('[aria-label="Next page"]')
    const prev = label => pager(label).querySelector('[aria-label="Previous page"]')
    assert.equal(prev('Project pages').disabled, true)
    await harness.click(next('Project pages'))
    assert.equal(pager('Project pages').textContent, '2')
    assert.equal(pager('Dashboard pages').textContent, '1')
    assert.equal(next('Project pages').disabled, true)
    await harness.click(next('Dashboard pages'))
    assert.equal(pager('Dashboard pages').textContent, '2')
    assert.equal(document.querySelector('section[aria-label="Dashboards"] [role=option]').textContent, 'Board 20')
    await harness.fill('Search dashboards…', 'Board 22')
    assert.equal(pager('Dashboard pages').textContent, '1', 'search resets only its own page')
    assert.equal(pager('Project pages').textContent, '2')
    assert.equal(next('Dashboard pages').disabled, true)
    assert.equal(document.querySelector('section[aria-label="Dashboards"] [role=option]').textContent, 'Board 22')
    await harness.fill('Search projects', 'Project B')
    assert.equal(pager('Project pages').textContent, '1')
    assert.equal(document.querySelector('section[aria-label="Project"] [role=option]').textContent, 'Project B')
    assert.equal(document.querySelector('input[aria-label="Search dashboards…"]').value, 'Board 22')
    assert.equal(harness.projectNavigation.length, 0, 'search and pagination never switch scope')
  })
  await t.test('More deletion confirms the current identity and preserves the selection on failure', async () => {
    await harness.reset()
    const { items, calls, navigation, selections, click, button, picker, dialog, failDelete, finishDelete, remaining } = harness
    await click(button('More actions')); await click(button('Delete dashboard'))
    assert.match(dialog().textContent, /Dashboard 1/)
    assert.match(dialog().textContent, new RegExp(items[0].artifactId))
    await click(button('Cancel')); assert.equal(calls.length, 0)
    await click(button('More actions')); await click(button('Delete dashboard'))
    failDelete(true); await click(button('Delete dashboard'))
    assert.match(dialog().textContent, /ARTIFACT_DRAFT_CONFLICT/)
    assert.match(picker().textContent, /Dashboard 1/)
    await click(button('Cancel')); failDelete(false)
    await click(button('More actions')); await click(button('Delete dashboard')); await click(button('Delete dashboard'))
    assert.equal(button('Deleting…').disabled, true)
    await finishDelete()
    assert.equal(dialog(), null)
    assert.match(picker().textContent, /Choose a dashboard/)
    assert.equal(selections.at(-1), null)
    assert.equal(navigation.at(-1), undefined)
    assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1).input)), { artifactId: items[0].artifactId, expectedRevision: 1, confirmed: true })
    assert.equal(remaining().length, 1)
    await click(picker())
    assert.ok(![...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 1'))
    assert.ok([...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 2'))
  })

  for (const hold of [false, true]) {
    await t.test(`deletion clears the same dashboard after an Assistant update ${hold ? 'still loading' : 'finished opening'}`, async () => {
      await harness.reset()
      const { items, navigation, selections, click, button, picker, finishDelete, notify, finishOpen } = harness
      await click(button('More actions')); await click(button('Delete dashboard')); await click(button('Delete dashboard'))
      await notify(items[0].artifactId, hold)
      await finishDelete()
      if (hold) await finishOpen()
      assert.match(picker().textContent, /Choose a dashboard/)
      assert.equal(!!document.querySelector('header .toolbar-version'), false)
      assert.equal(selections.at(-1), null)
      assert.equal(navigation.at(-1), undefined)
      await click(picker())
      assert.ok(![...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 1'))
      assert.ok([...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 2'))
    })

    await t.test(`deletion does not select another dashboard on a late Assistant update ${hold ? 'still loading' : 'finished opening'}`, async () => {
      await harness.reset()
      const { items, navigation, selections, click, button, picker, finishDelete, notify, finishOpen } = harness
      await click(button('More actions')); await click(button('Delete dashboard')); await click(button('Delete dashboard'))
      await notify(items[1].artifactId, hold)
      await finishDelete()
      if (hold) await finishOpen()
      assert.match(picker().textContent, /Choose a dashboard/)
      assert.equal(selections.at(-1), null)
      assert.equal(navigation.at(-1), undefined)
      await click(picker())
      assert.ok(![...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 1'), 'an older open response must not restore the deleted list entry')
      assert.ok([...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 2'))
    })
  }

  await t.test('a failed deletion still allows subsequent Assistant updates', async () => {
    await harness.reset()
    const { items, selections, click, button, picker, dialog, failDelete, notify } = harness
    await click(button('More actions')); await click(button('Delete dashboard'))
    failDelete(true)
    await click(button('Delete dashboard'))
    assert.match(dialog().textContent, /ARTIFACT_DRAFT_CONFLICT/)
    await click(button('Cancel'))
    await notify(items[0].artifactId)
    assert.match(picker().textContent, /Dashboard 1/)
    assert.equal(selections.at(-1).artifactId, items[0].artifactId)
    await click(picker())
    assert.ok([...document.querySelectorAll('[role=option]')].some(item => item.textContent === 'Dashboard 1'))
  })
})
