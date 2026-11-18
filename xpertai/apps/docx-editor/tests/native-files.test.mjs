import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DocxFileView } from '../dist/lib/native/view.js'
import { DocxFiles } from '../dist/lib/native/files.js'
import { DocxFormat } from '../dist/lib/native/format.js'
import { DOCX_MODEL, DocxResourceEditor } from '../dist/lib/native/resource-editor.js'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context = { hostType:'agent', hostId:uuid(1), tenantId:uuid(2), organizationId:uuid(3), userId:uuid(4), runtimeScope:{projectId:uuid(5)} }
const source = { providerKey:'spaces', resourceId:uuid(6) }, key = 'docx_editor.file'

test('native Word shares the document category without changing its OOXML model or file codec', () => {
  const format = new DocxFormat().descriptor
  assert.equal(format.resourceType.typeId, 'document')
  assert.equal(format.resourceType.modelId, 'docx_editor.ooxml')
  assert.equal(format.resourceType.creatable, false)
  assert.equal(format.extension, 'docx')
  assert.deepEqual(new DocxResourceEditor().descriptor.supports, [
    { ...DOCX_MODEL, access: ['view', 'edit'] },
    { ...DOCX_MODEL, typeId: 'xpert.document', access: ['view', 'edit'] }
  ])
})

test('declares on-demand Project resource activation for the real ChatKit slot and Cloud', () => {
  const view = new DocxFileView({})
  for(const slot of ['agent.workbench','agent.workbench.main','agent.workbench.fixed']) {
    const [manifest] = view.getViewManifests(context,slot)
    assert.equal(manifest.slot,'agent.workbench')
    assert.equal(manifest.activation.projectResource,true)
    assert.equal(manifest.workbench.openMode,'on-demand')
  }
  assert.equal(view.getViewManifests({...context,hostType:'project'},'project.files.editor').length,1)
  assert.equal(view.getViewManifests(context,'unrelated.slot').length,0)
})
test('takes actor and Project only from the host and rejects malformed actions with HTTP 400', async () => {
  let input
  const view = new DocxFileView({read:async value=>{input=value;return {revision:'1'}}})
  await view.executeViewAction(context,key,'file.read',{input:source})
  assert.deepEqual(input,{actor:{tenantId:uuid(2),organizationId:uuid(3),userId:uuid(4)},projectId:uuid(5),assistantId:uuid(1),source})
  for(const value of [undefined,{...source,actor:{userId:uuid(7)}},{resourceId:'bad',providerKey:'spaces'}])
    await assert.rejects(view.executeViewAction(context,key,'file.read',{input:value}),error=>error.getStatus()===400)
  await assert.rejects(view.executeViewAction({...context,runtimeScope:undefined},key,'file.read',{input:source}),error=>error.getStatus()===400)
})
test('rejects stale or readonly writes before the authoritative publisher', async () => {
  let calls=0, canWrite=true
  const api={read:async()=>({registration:{key:'docx_editor.docx'},file:{title:'deck.docx'},revision:'new',canWrite}),write:async()=>{calls++;return {revision:'saved'}}}
  const files=new DocxFiles({require:()=>api},{validateFile:async()=>{}})
  const input={actor:context,projectId:uuid(5),source}
  await assert.rejects(files.save(input,'old',Buffer.from('draft')),error=>error.getStatus()===409)
  canWrite=false
  await assert.rejects(files.save(input,'new',Buffer.from('draft')),error=>error.getStatus()===403)
  assert.equal(calls,0)
  canWrite=true
  assert.equal((await files.save(input,'new',Buffer.from('draft'))).revision,'saved')
  assert.equal(calls,1)
})
test('blank DOCX is accepted and malformed ZIP input is rejected before editing',async()=>{
  const format=new DocxFormat()
  await format.validateFile(await format.create())
  await assert.rejects(format.validateFile(Buffer.from('not a zip')),error=>error.getStatus()===400)
})


test('old workspace links follow new Spaces ownership for download, edit and collaboration', async () => {
 const seen=[]
 const api={resolveFile:async()=>({resource:{resourceRef:source}}),read:async input=>{seen.push(input);return {registration:{key:'docx_editor.docx'},file:{path:'document-exports/a.docx',title:'document'},revision:'current',canWrite:true,buffer:Buffer.from('docx')}},readFile:async()=>{throw Error('generic read bypass')},write:async input=>{seen.push(input);return {revision:'saved'}},createSession:async input=>{seen.push(input);return {sessionId:'session'}}}
 const files=new DocxFiles({require:()=>api},{validateFile:async()=>{}}),input={actor:context,projectId:uuid(5),path:'document-exports/a.docx',editorKey:'docx_editor.docx'}
 assert.equal((await files.download(input)).reference.filePath,input.path)
 assert.equal((await files.save(input,'current',Buffer.from('edit'))).revision,'saved')
 assert.equal((await files.session(input)).sessionId,'session')
 assert.ok(seen.every(value=>value.source===source&&!('path' in value)))
})
