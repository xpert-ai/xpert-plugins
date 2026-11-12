const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { createRequire } = require('node:module')
const { JSDOM, VirtualConsole } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const bundle = readFileSync(require.resolve('../dist/remote/app.js'), 'utf8')
const settle = async predicate => {
  for (let i = 0; i < 50; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.ok(predicate(), 'production view did not settle')
}
for (const page of ['data', 'templates', 'explore']) test(`production ${page} bundle mounts shared components with one React runtime`, async t => {
  const errors = [], calls = [], vc = new VirtualConsole()
  vc.on('jsdomError', e => errors.push(e.message))
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://view.test', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc })
  t.after(() => dom.window.close())
  const w = dom.window
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
  w.HTMLElement.prototype.scrollIntoView = function () {}
  w.__DASHBOARD_PAGE__ = page
  function send(message) { w.dispatchEvent(new w.MessageEvent('message', { source: host, data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'test', scopeRevision: 1, ...message } })) }
  const host = { postMessage(message) {
    calls.push(message)
    setTimeout(() => {
      if (message.type === 'ready') send({ type: 'init', locale: 'zh-Hans', initialQuery: {}, theme: { mode: 'light' } })
      if (message.type === 'requestData') send({ type: 'data', requestId: message.requestId, data: { meta: { canEdit: true, sources: [], datasets: [], page: 1, hasMore: false } } })
      if (message.type === 'executeAction' && message.actionKey === 'resource-directory') {
        const { LibraryDirectoryService } = require('../dist/lib/library/directory.service')
        const directory = new LibraryDirectoryService({ actor: async () => ({}), matchOwned: async () => [] })
        directory.list({}, message.input).then(data => send({type:'actionResult',requestId:message.requestId,data:{success:true,data}}))
      }
      if (message.type === 'invokeClientCommand') {
        send({type:'clientCommandResult',requestId:message.requestId,data:{success:true}})
        if(message.commandKey==='workbench.navigation.open') send({type:'init',locale:'zh-Hans', initialQuery:{parameters:message.payload.parameters},theme:{mode:'light'}})
      }
    }, 0)
  } }
  Object.defineProperty(w, 'parent', { value: host })
  w.eval(bundle)
  await settle(() => w.document.querySelector('h1,h2'))
  assert.ok(calls.some(item => item.type === 'requestData'))
  if (page === 'data') {
    w.document.querySelector('header button').click()
    await settle(() => w.document.querySelector('[role="dialog"]'))
    assert.ok(w.document.querySelector('#dataset-name'))
  }
  if (page === 'explore') {
    assert.ok(w.document.body.textContent.includes('数据与知识'))
    w.document.querySelector('button[aria-label="分析与洞察"]').click()
    await settle(()=>w.document.querySelectorAll('[data-catalog-entry]').length===10)
    const uses=[...w.document.querySelectorAll('[data-catalog-entry] button')].filter(button=>button.textContent==='使用此任务')
    assert.equal(uses.length,10);assert.ok(uses.every(button=>button.disabled))
    assert.ok(!calls.some(c=>c.actionKey==='catalog-seed'||c.actionKey==='explore-use-task'))
    ;[...w.document.querySelectorAll('button')].find(c=>c.textContent==='返回').click()
    await settle(()=>w.document.querySelector('button[aria-label="分析与洞察"]'))
  }
  if (page === 'templates') {
    await settle(() => w.document.querySelectorAll('[data-catalog-entry]').length === 6)
    const before=calls.length
    w.document.querySelector('[data-catalog-entry] button').click()
    await settle(() => w.document.querySelector('[role="dialog"]'))
    assert.ok(w.document.querySelector('[role="dialog"]').textContent.includes('当前仅提供目录'))
    assert.equal(calls.slice(before).filter(item=>item.type==='executeAction').length,0)
    ;[...w.document.querySelectorAll('button')].find(item => item.textContent === '关闭预览').click()
    await settle(() => !w.document.querySelector('[role="dialog"]'))
    const chooseTab = text => [...w.document.querySelectorAll('[role="tab"]')].find(item => item.textContent === text).dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,button:0}))
    chooseTab('视觉主题')
    await settle(() => calls.some(c=>c.actionKey==='resource-directory'&&c.input.kind==='visual-theme') && w.document.querySelectorAll('[data-catalog-entry]').length===12)
    ;[...w.document.querySelectorAll('button')].find(item=>item.textContent==='下一页').click()
    await settle(()=>calls.some(c=>c.actionKey==='resource-directory'&&c.input.page===2))
    chooseTab('组件')
    await settle(() => w.document.querySelector('[data-catalog-entry="component-detail-table"]'))
    assert.equal(w.document.querySelectorAll('[data-catalog-entry]').length,12)
    ;[...w.document.querySelectorAll('button')].find(item=>item.textContent==='场景').click()
    await settle(()=>w.document.querySelectorAll('[data-catalog-entry]').length===0)
    ;[...w.document.querySelectorAll('button')].find(item=>item.textContent==='全部').click()
    await settle(()=>w.document.querySelectorAll('[data-catalog-entry]').length===12)
    const input=w.document.querySelector('input')
    Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(input,'CSV')
    input.dispatchEvent(new w.Event('input',{bubbles:true}));input.closest('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}))
    await settle(()=>w.document.querySelectorAll('[data-catalog-entry]').length===2)
    assert.ok(w.document.querySelector('[data-catalog-entry="component-pivot-table"]'))
    const count=calls.filter(c=>c.actionKey==='resource-directory').length
    send({type:'init',locale:'en',initialQuery:{parameters:calls.filter(c=>c.commandKey==='workbench.navigation.open').at(-1).payload.parameters},theme:{mode:'dark'}})
    await settle(()=>calls.filter(c=>c.actionKey==='resource-directory').length>count)
    assert.equal(w.document.querySelector('input').value,'CSV')
    assert.ok(!calls.some(c=>c.actionKey?.startsWith('catalog-')||c.commandKey==='assistant.composer.insert'))
  }
  assert.deepEqual(errors, [])
})
