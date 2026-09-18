// DOM-only state regression tests; no browser, backend, or database is started.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { build } from 'esbuild'
import React from 'react'
import { createRoot } from 'react-dom/client'

const workspaceRequire = createRequire(new URL('../../../package.json', import.meta.url))
const { JSDOM } = createRequire(workspaceRequire.resolve('jest-environment-jsdom'))('jsdom')
const temp = await mkdtemp(resolve('.test-controller-'))
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'Event']) globalThis[key] = dom.window[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const root = createRoot(document.getElementById('root'))
const { act } = React
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
try {
  await writeFile(`${temp}/bridge.cjs`, `
    const state = {data: async () => ({items: []}), action: async () => ({}), commands: []};
    module.exports = {state, data: (...args) => state.data(...args), action: (...args) => state.action(...args),
      command: async (...args) => {state.commands.push(args)}, onHost: () => () => {}, startBridge: () => () => {}, upload: async () => {}};
  `)
  await writeFile(`${temp}/controls.cjs`, `
    const React = require('react');
    const element = tag => props => React.createElement(tag, props);
    module.exports = {Button: element('button'), ControlInput: element('input'), SelectField: element('select'), SelectOption: element('option')};
  `)
  await writeFile(`${temp}/charts.cjs`, `exports.ChartPanel = () => null;`)
  await build({
    entryPoints: ['src/ui/controller.ts', 'src/ui/dashboard.tsx', 'src/ui/plan-chat-review.tsx'], outdir: temp, outExtension: { '.js': '.cjs' },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    plugins: [{ name: 'test-host', setup(build) {
      for (const [name, file] of [['bridge', 'bridge'], ['controls', 'controls'], ['analysis-panels', 'charts']]) {
        build.onResolve({ filter: new RegExp(`^\\./${name}$`) }, () => ({ path: `${temp}/${file}.cjs`, external: true }))
      }
    } }],
  })
  const require = createRequire(import.meta.url)
  const { state } = require(`${temp}/bridge.cjs`)
  const { useStudio } = require(`${temp}/controller.cjs`)
  let studio
  function App() { studio = useStudio(); return null }
  await act(async () => root.render(React.createElement(App)))
  await act(async () => studio.createConnection())
  assert.deepEqual(state.commands.pop(), ['platform.data-source.create', {}, { waitForUser: true }])
  const a = { id: 'A', kind: 'plan', revision: 1, status: 'queued', payload: {} }
  const b = { ...a, id: 'B', status: 'awaiting_approval' }
  state.data = async (kind) => kind === 'record' ? { item: { ...a, status: 'succeeded' } } : { items: [b] }
  await act(async () => { studio.setPlan(a); studio.setTask(a) })
  await act(async () => { studio.setPlan(b); studio.setPanel('plan') })
  await act(async () => new Promise((resolve) => setTimeout(resolve, 2600)))
  assert.equal(studio.plan.id, 'B', 'background A must not replace selected B')
  await act(async () => studio.loadList('plan'))
  assert.equal(studio.plan, null, 'navigation must reopen the plans list')
  assert.equal(studio.list[0].id, 'B')

  const first = deferred(), second = deferred()
  state.data = (_kind, _input, _page, search) => search === 'first' ? first.promise : second.promise
  const target = { dataSourceId: 'source', database: 'db' }
  const oldSearch = studio.loadObjects(target, 1, 'first'), newSearch = studio.loadObjects(target, 2, 'second')
  await act(async () => { second.resolve({ item: { items: [{ name: 'second' }], hasMore: true } }); await newSearch })
  await act(async () => { first.resolve({ item: { items: [{ name: 'first' }], hasMore: false } }); await oldSearch })
  assert.equal(studio.objects[0].name, 'second')
  assert.equal(studio.objectPage, 2)
  assert.equal(studio.hasObjects, true)

  const late = deferred()
  state.data = () => late.promise
  const record = studio.requestRecord('A')
  await act(async () => studio.setPanel('results'))
  late.resolve({ item: a })
  assert.equal(await record, null, 'late detail must not undo navigation')

  const records = Array.from({ length: 65 }, (_, i) => ({ ...b, id: String(i) }))
  state.data = async (_kind, _input, page) => ({ items: records.slice((page - 1) * 50, page * 50), page, hasMore: page === 1 })
  await act(async () => studio.loadList('plan'))
  assert.equal(studio.list.length, 50)
  assert.equal(studio.listHasMore, true)
  await act(async () => studio.loadList('plan', 2))
  assert.equal(studio.list.length, 65)
  assert.equal(studio.listHasMore, false)

  const { Dashboard } = require(`${temp}/dashboard.cjs`)
  state.data = async (kind, input, page) => {
    if (kind === 'chart') return { items: [{ id: 'chart-1', title: 'first chart', summary: { content: '{}' } }], hasMore: true }
    if (kind === 'dashboard') return { items: page === 1 ? [] : [{ id: 'board-51', title: 'older board', summary: { content: '["chart-80"]' } }], hasMore: page === 1 }
    assert.equal(input.id, 'chart-80')
    return { item: { id: 'chart-80', kind: 'chart', title: 'older chart', payload: { content: '{}' } } }
  }
  await act(async () => root.render(React.createElement(Dashboard, { zh: false })))
  const more = [...document.querySelectorAll('button')].find((button) => button.textContent === 'More dashboards')
  assert.ok(more)
  await act(async () => more.click())
  const select = document.querySelector('select')
  assert.ok([...select.options].some((option) => option.value === 'board-51'))
  await act(async () => { select.value = 'board-51'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  assert.ok(document.querySelector('.dashboard-chart')?.textContent.includes('older chart'), 'a dashboard must load referenced charts beyond page one')
  const { PlanChatReview } = require(`${temp}/plan-chat-review.cjs`)
  let refreshes = 0
  const reviewProps = { plan: { id: 'frozen-plan', status: 'awaiting_approval' }, zh: false,
    disabled: false, protect: async work => work(), onRefresh: async () => { refreshes++ } }
  await act(async () => root.render(React.createElement(PlanChatReview, reviewProps)))
  assert.deepEqual([...document.querySelectorAll('button')].map(button => button.textContent), ['Review in chat', 'Refresh status'])
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Review in chat').click())
  assert.equal(state.commands.length, 1)
  assert.equal(state.commands[0][0], 'assistant.chat.send_message')
  assert.ok(state.commands[0][1].text.includes('frozen-plan'))
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Refresh status').click())
  assert.equal(refreshes, 1)
  await act(async () => root.render(React.createElement(PlanChatReview, { ...reviewProps, disabled: true })))
  assert.ok([...document.querySelectorAll('button')].find(button => button.textContent === 'Review in chat').disabled)
  await act(async () => root.render(React.createElement(PlanChatReview, { ...reviewProps, plan: { id: 'frozen-plan', status: 'succeeded' } })))
  assert.deepEqual([...document.querySelectorAll('button')].map(button => button.textContent), ['Refresh status'])
  console.log('Controller and dashboard DOM regressions passed: polling, navigation, search ordering, collection paging, saved chart restoration.')
} finally {
  await act(async () => root.unmount())
  dom.window.close()
  await rm(temp, { recursive: true, force: true })
}
