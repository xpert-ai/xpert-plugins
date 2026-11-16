import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PptxView } from '../dist/lib/view.js'
import { PptxFiles } from '../dist/lib/files.js'
import { PptxFormat } from '../dist/lib/format.js'

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context = { hostType:'agent', hostId:uuid(1), tenantId:uuid(2), organizationId:uuid(3), userId:uuid(4), runtimeScope:{projectId:uuid(5)} }
const source = { providerKey:'spaces', resourceId:uuid(6) }, key = 'pptx_editor.editor'

test('declares on-demand Project resource activation for the real ChatKit slot and Cloud', () => {
  const view = new PptxView({})
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
  const view = new PptxView({read:async value=>{input=value;return {revision:'1'}}})
  await view.executeViewAction(context,key,'file.read',{input:source})
  assert.deepEqual(input,{actor:{tenantId:uuid(2),organizationId:uuid(3),userId:uuid(4)},projectId:uuid(5),assistantId:uuid(1),source})
  for(const value of [undefined,{...source,actor:{userId:uuid(7)}},{resourceId:'bad',providerKey:'spaces'}])
    await assert.rejects(view.executeViewAction(context,key,'file.read',{input:value}),error=>error.getStatus()===400)
  await assert.rejects(view.executeViewAction({...context,runtimeScope:undefined},key,'file.read',{input:source}),error=>error.getStatus()===400)
})
test('template library is feature-gated and rejects forged template actions before service invocation', async () => {
  const view = new PptxView({}, { compose: async () => { throw new Error('must_not_run') } })
  const library = view.getViewManifests(context, 'agent.workbench').find(item => item.key === 'pptx_editor.templates')
  assert.deepEqual(library.activation.requiredFeatures, ['pptx-editor'])
  assert.equal(view.getViewData(context, library.key, {}).meta.requiresDocument, false)
  await assert.rejects(view.executeViewAction(context, library.key, 'templates.compose', {input:{projectId:uuid(99)}}), error => error.getStatus() === 400)
})
test('rejects stale or readonly writes before the authoritative publisher', async () => {
  let calls=0, canWrite=true
  const api={read:async()=>({registration:{key:'pptx_editor.pptx'},file:{title:'deck.pptx'},revision:'new',canWrite}),write:async()=>{calls++;return {revision:'saved'}}}
  const files=new PptxFiles({require:()=>api},{validateFile:async()=>{}})
  const input={actor:context,projectId:uuid(5),source}
  await assert.rejects(files.save(input,'old',Buffer.from('draft')),error=>error.getStatus()===409)
  canWrite=false
  await assert.rejects(files.save(input,'new',Buffer.from('draft')),error=>error.getStatus()===403)
  assert.equal(calls,0)
  canWrite=true
  assert.equal((await files.save(input,'new',Buffer.from('draft'))).revision,'saved')
  assert.equal(calls,1)
})
test('blank PPTX is accepted and malformed ZIP input is rejected before editing',async()=>{
  const format=new PptxFormat()
  await format.validateFile(await format.create())
  await assert.rejects(format.validateFile(Buffer.from('not a zip')),error=>error.getStatus()===400)
})
