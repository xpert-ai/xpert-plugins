import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useDocument } from '../remote/use-document'
import { action, command, fileAction, onEditorEvent, closePrepared } from '../remote/bridge'
import { parsePptx, savePptx } from '../src/core/pptx-file.utils'
import type { PptxDeck } from '../src/core/pptx-types'

jest.mock('../remote/bridge',()=>({ action:jest.fn(), command:jest.fn(), fileAction:jest.fn(),
  onEditorEvent:jest.fn(()=>()=>{}), closePrepared:jest.fn() }))
jest.mock('../remote/i18n',()=>({ t:(key:string)=>key }))
jest.mock('../src/core/pptx-file.utils',()=>({ parsePptx:jest.fn(), savePptx:jest.fn(), PPTX_MIME_TYPE:'application/pptx' }))

const source={providerKey:'spaces',resourceId:'resource'}
const initial: PptxDeck={width:100,height:100,slides:[]}
let root:Root, container:HTMLDivElement, doc:ReturnType<typeof useDocument>
function Probe(){doc=useDocument(source);return null}
beforeEach(()=>{
  jest.clearAllMocks()
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true})
  container=document.createElement('div');document.body.append(container);root=createRoot(container)
  jest.mocked(action).mockResolvedValue({revision:'1',title:'deck.pptx',canWrite:true,contentBase64:btoa('original')})
  jest.mocked(command).mockResolvedValue({success:true})
  jest.mocked(parsePptx).mockImplementation(async()=>structuredClone(initial))
  jest.mocked(savePptx).mockResolvedValue(new ArrayBuffer(1))
  jest.mocked(fileAction).mockResolvedValue({revision:'2',sequence:2})
})
afterEach(async()=>{await act(async()=>root.unmount());container.remove()})
async function mount(){await act(async()=>root.render(createElement(Probe)))}
async function edit(){await act(async()=>doc.edit(value=>{value.width=200}))}

it('retains a conflicted draft and blocks closing until the user resolves it',async()=>{
  await mount();await edit()
  jest.mocked(fileAction).mockRejectedValue(new Error('pptx.version_conflict'))
  await act(async()=>{await expect(doc.save()).rejects.toThrow('version_conflict')})
  expect(doc.deck?.width).toBe(200);expect(doc.dirty).toBe(true);expect(doc.error).toBe('conflict')
  const close=jest.mocked(onEditorEvent).mock.calls.at(-1)![0]
  await act(async()=>close({kind:'prepareClose',resourceId:'resource',requestId:'close-1'}))
  expect(closePrepared).toHaveBeenCalledWith('close-1',false)
  expect(doc.deck?.width).toBe(200);expect(doc.dirty).toBe(true)
})

it('shares an in-flight save with close preparation and closes only after acknowledgement',async()=>{
  await mount();await edit()
  let acknowledge!:(value:unknown)=>void
  jest.mocked(fileAction).mockReturnValue(new Promise(resolve=>{acknowledge=resolve}))
  let pending!:Promise<void>
  await act(async()=>{pending=doc.save()})
  const close=jest.mocked(onEditorEvent).mock.calls.at(-1)![0]
  await act(async()=>close({kind:'prepareClose',resourceId:'resource',requestId:'close-2'}))
  expect(fileAction).toHaveBeenCalledTimes(1);expect(closePrepared).not.toHaveBeenCalled()
  await act(async()=>{acknowledge({revision:'2',sequence:2});await pending})
  expect(closePrepared).toHaveBeenCalledWith('close-2',true)
  expect(doc.dirty).toBe(false);expect(doc.info?.revision).toBe('2')
})

it('keeps a read-only document clean when edit and history shortcuts are invoked',async()=>{
  jest.mocked(action).mockResolvedValue({revision:'1',title:'deck.pptx',canWrite:false,contentBase64:btoa('original')})
  await mount();await edit()
  await act(async()=>{doc.travel('undo');await doc.save()})
  expect(doc.deck?.width).toBe(100);expect(doc.dirty).toBe(false)
  expect(fileAction).not.toHaveBeenCalled()
})
