import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { WorkspaceAdapter } from '../src/lib/remote/adapter.js'
import { ObservableCollection } from '../vendor/dockyard/src/index.js'
import { fixture } from './fixtures.js'

test('external writes repaint a clean editor, while edits during a query are preserved', async () => {
 const dom = new JSDOM('<body data-theme="dark"><textarea data-editor="theme.css"></textarea></body>')
 const names = ['window','document','Event'] as const
 const old = new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
 for(const n of names)Object.defineProperty(globalThis,n,{configurable:true,value:Reflect.get(dom.window,n)})
 const adapter=new WorkspaceAdapter(), {manager,state}=fixture()
 const buffers=new Map([['theme.css','old']]), notices:string[]=[]
 const initial={workspace:{revision:1,state},buffers:{revision:10,items:[{contentId:'theme.css',text:'old'}]},scratchpad:{revision:0,text:null},proposal:null}
 try {
  mock.method(adapter.bridge,'connect',async()=>({locale:'en-US'}))
  mock.method(adapter.bridge,'resize',()=>{})
  const query=mock.method(adapter.bridge,'query',async()=>initial)
  await adapter.connect()
  adapter.attach({manager,buffers,sourceDocuments:new ObservableCollection(),getPreset:()=> 'development',openFile:()=>{},toast:s=>notices.push(s)})
  const input=dom.window.document.querySelector('textarea')!;input.value='old'
  let paints=0;input.addEventListener('click',()=>{paints++;buffers.set('theme.css',input.value)})
  query.mock.mockImplementation(async()=>({...initial,buffers:{revision:11,items:[{contentId:'theme.css',text:'new'}]}}))
  await adapter.syncSavedBuffers()
  assert.equal(input.value,'new');assert.equal(paints,1);assert.equal(adapter.buffers.revision,11)
  let finish!:(v:typeof initial)=>void
  query.mock.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const pending=adapter.syncSavedBuffers()
  input.value='my edit';buffers.set('theme.css','my edit');adapter.bufferEdited()
  finish({...initial,buffers:{revision:12,items:[{contentId:'theme.css',text:'server next'}]}})
  await pending
  assert.equal(input.value,'my edit');assert.equal(buffers.get('theme.css'),'my edit');assert.equal(adapter.buffers.revision,11)
  assert.ok(notices.at(-1)?.includes('Keep your edits'))
 } finally {adapter.dispose();mock.restoreAll();dom.window.close();for(const[n,d]of old){if(d)Object.defineProperty(globalThis,n,d);else Reflect.deleteProperty(globalThis,n)}}
})
