import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PdfView } from '../dist/lib/view.js'
import { PdfFiles } from '../dist/lib/files.js'
import { PdfFormat } from '../dist/lib/format.js'
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const context = { hostType: 'agent', hostId: uuid(1), tenantId: uuid(2), organizationId: uuid(3), userId: uuid(4), runtimeScope: { projectId: uuid(5) } }
const source = { providerKey: 'spaces', resourceId: uuid(6) }, key = 'pdf_viewer.file'
test('PDF exposes preview in both hosts and no mutation or editing action', async () => {
  const view = new PdfView({})
  for (const slot of ['agent.workbench', 'agent.workbench.main', 'agent.workbench.fixed']) {
    const [manifest] = view.getViewManifests(context, slot)
    assert.equal(manifest.activation.projectResource, true)
    assert.deepEqual(manifest.actions.map(a => a.key), ['file.read', 'viewer.asset'])
    assert.equal(manifest.clientCommands.length, 0)
  }
  assert.equal(view.getViewManifests({ ...context, hostType: 'project' }, 'project.files.editor').length, 1)
  assert.equal(view.executeViewFileAction, undefined)
  await assert.rejects(view.executeViewAction(context, key, 'file.save', { input: source }))
  await assert.rejects(new PdfFormat().create(), error => error.getStatus() === 405)
})
test('read and original download are authorized with host scope, never request identity', async () => {
  let received, calls = 0
  const bytes = Buffer.from('%PDF-1.7\noriginal bytes')
  const api = { read: async input => { received = input; calls++; return { registration: { key: 'pdf_viewer.pdf' }, file: { title: 'test.pdf', path: 'files/test.pdf' }, revision: 'v1', canWrite: true, buffer: bytes } } }
  const files = new PdfFiles({ require: () => api }, new PdfFormat()), view = new PdfView(files)
  const result = await view.executeViewAction(context, key, 'file.read', { input: source })
  assert.equal(result.data.canWrite, false)
  assert.ok(Buffer.from(result.data.contentBase64, 'base64').equals(bytes))
  assert.deepEqual(received.actor, { tenantId: uuid(2), organizationId: uuid(3), userId: uuid(4) })
  const download = await view.resolveViewFile(context, key, { purpose: 'download', fileKey: JSON.stringify(source) })
  assert.equal(download.reference.projectId, uuid(5)); assert.equal(calls, 2)
  await assert.rejects(view.executeViewAction(context, key, 'file.read', { input: { ...source, actor: { userId: uuid(99) } } }), error => error.getStatus() === 400)
  await assert.rejects(view.executeViewAction(context, key, 'viewer.asset', { input: { name: '../../package.json' } }), error => error.getStatus() === 400)
  await assert.rejects(new PdfFormat().validateFile(Buffer.from('<html>active content</html>')))
})
test('a PDF workspace link stays readable after Spaces takes ownership', async () => {
 const bytes=Buffer.from('%PDF-1.7\noriginal bytes'),seen=[]
 const api={resolveFile:async()=>({resource:{resourceRef:source}}),read:async input=>{seen.push(input);return {registration:{key:'pdf_viewer.pdf'},file:{path:'file.pdf',title:'file.pdf'},revision:'v2',canWrite:true,buffer:bytes}},readFile:async()=>{throw Error('stale generic file lane')}}
 const files=new PdfFiles({require:()=>api},new PdfFormat()),input={actor:context,projectId:uuid(5),path:'file.pdf',editorKey:'pdf_viewer.pdf'}
 assert.equal((await files.read(input)).canWrite,false)
 assert.equal((await files.download(input)).reference.filePath,'file.pdf')
 assert.ok(seen.every(value=>value.source===source&&!('path' in value)))
})
