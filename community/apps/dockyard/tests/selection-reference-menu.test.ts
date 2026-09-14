import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { fixture } from './fixtures.js'
import { adapter } from '../src/lib/remote/adapter.js'
import { mountSelectionReferenceMenu } from '../src/lib/remote/selection-reference-menu.js'
import { ObservableCollection } from '../vendor/dockyard/src/index.js'
import type { MenuEntry } from '../vendor/dockyard/src/index.js'

test('right click snapshots selection, keeps empty native menu and never sends a message', async () => {
 const dom = new JSDOM('<textarea data-editor="theme.css"></textarea>')
 const names = ['window','document','HTMLElement','HTMLTextAreaElement'] as const
 const previous = new Map(names.map(n => [n, Object.getOwnPropertyDescriptor(globalThis,n)]))
 for(const name of names) Object.defineProperty(globalThis,name,{configurable:true,value:Reflect.get(dom.window,name)})
 const {manager} = fixture()
 try {
  const notices: string[] = []; let entries: (MenuEntry|null)[] = []
  const menu = mock.method(manager,'ShowMenu',(items:(MenuEntry|null)[]) => { entries = items })
  const append = mock.method(adapter.bridge,'appendReferences',async () => ({success:true}))
  const buffers = new Map([['whole.md','first\nsecond\n']])
  const dispose = mountSelectionReferenceMenu({manager,buffers,sourceDocuments:new ObservableCollection(),getPreset:()=> 'development',toast:s=>notices.push(s),openFile:()=>{}})
  const editor = dom.window.document.querySelector('textarea')!
  editor.value = 'before\n  selected\nlast'; editor.setSelectionRange(7,18)
  const event = new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:25,clientY:30});editor.dispatchEvent(event)
  assert.equal(event.defaultPrevented,true);assert.equal(menu.mock.callCount(),1)
  editor.value = 'changed after menu opened'
  entries[0]?.Execute?.(); await new Promise(setImmediate)
  assert.deepEqual(append.mock.calls[0].arguments,[[{type:'code',path:'theme.css',text:'  selected\n',label:'Help me edit · theme.css',startLine:2,endLine:2}]])
  assert.equal(notices.length,1)
  editor.setSelectionRange(0,0)
  const empty = new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});editor.dispatchEvent(empty)
  assert.equal(empty.defaultPrevented,false);assert.equal(menu.mock.callCount(),1)
  const fileRow = dom.window.document.createElement('button');fileRow.dataset.file='whole.md'
  const icon = dom.window.document.createElement('span');fileRow.append(icon);dom.window.document.body.append(fileRow)
  icon.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
  assert.equal(menu.mock.callCount(),2)
  assert.deepEqual(entries.map(e=>e?.label),['Help me edit','Explain'])
  entries[1]?.Execute?.();await new Promise(setImmediate)
  assert.deepEqual(append.mock.calls[1].arguments,[[{type:'code',path:'whole.md',text:'first\nsecond\n',startLine:1,endLine:2,label:'Explain · whole.md'}]])
  fileRow.dataset.file='overview'
  const welcome = new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true});icon.dispatchEvent(welcome)
  assert.equal(welcome.defaultPrevented,false);assert.equal(menu.mock.callCount(),2)
  dispose();editor.setSelectionRange(0,3);editor.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
  assert.equal(menu.mock.callCount(),2)
 } finally {
  manager.Dispose();mock.restoreAll();dom.window.close()
  for(const [name,descriptor] of previous) { if(descriptor) Object.defineProperty(globalThis,name,descriptor);else Reflect.deleteProperty(globalThis,name) }
 }
})
