// Explicitly initialized local organization only. Passwords remain in macOS Keychain.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHash } from 'node:crypto'
import * as Y from 'yjs'
import { io } from 'socket.io-client'
const identity = JSON.parse(readFileSync(process.env.SPACES_TEST_IDENTITY, 'utf8'))
const fixture = JSON.parse(readFileSync(process.env.SPACES_PROJECT_FIXTURE, 'utf8'))
const assistants = JSON.parse(readFileSync(process.env.SPACES_ASSISTANT_FIXTURE, 'utf8')).assistants
const api = process.env.XPERT_API_URL ?? 'http://localhost:3000/api'
const projectId = fixture.projectId, project = `/xpert-project/${projectId}`
const host = (id = fixture.assistantIds[0]) => `/view-hosts/agent/${id}/views/spaces.views__spaces.workspace`
const results = [], sockets = [], cleanup = []
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const record = name => { results.push({ name, passed: true }); console.log(`PASS ${name}`) }
async function login(name) {
  const user = name === 'admin' ? { email: identity.adminEmail } : identity.testUsers.find(u => u.name === name)
  const password = execFileSync('security', ['find-generic-password', '-s', name === 'admin' ? 'xpert-local-plugin-password' : 'xpert-spaces-test-password', '-a', user.email, '-w'], { encoding: 'utf8' }).trim()
  const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) })
  assert.equal(response.status, 200)
  return { authorization: `Bearer ${(await response.json()).token}`, 'tenant-id': identity.tenantId, 'organization-id': identity.organizationId, 'x-xpert-view-project-id': projectId }
}
async function request(headers, path, body, method = body === undefined ? 'GET' : 'POST', expected) {
  const response = await fetch(`${api}${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text(); const data = text ? JSON.parse(text) : null
  assert(expected ? (Array.isArray(expected) ? expected.includes(response.status) : expected === response.status) : response.ok, `${method} ${path}: ${response.status} ${text.slice(0,500)}`)
  return data
}
const action = async (headers, key, input, expected = 201, assistant) => (await request(headers, `${host(assistant)}/actions/${key}`, { input }, 'POST', expected))?.data
const tree = async (headers, assistant) => (await request(headers, `${host(assistant)}/data`)).meta
function document(state) { const d = new Y.Doc(); Y.applyUpdate(d, Buffer.from(state, 'base64')); return d }
function append(doc, text) { const vector = Y.encodeStateVector(doc); doc.getArray('blocks').get(0).get('text').insert(0, text); return Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64') }
const read = (headers, itemId) => action(headers, 'page.read', { itemId })
const fileRead = (headers, path) => request(headers, `${project}/workspace/file?path=${encodeURIComponent(path)}`)
const fileWrite = (headers, path, content) => request(headers, `${project}/workspace/file`, { path, content }, 'PUT')
async function socketSession(headers, itemId, assistant) {
  const { session } = await action(headers, 'page.session', { itemId }, 201, assistant)
  const socket = io(session.connectionUrl, { autoConnect: false, transports: ['websocket'], auth: { sessionId: session.sessionId, clientKey: session.clientKey, documentId: session.documentId } })
  sockets.push(socket)
  await new Promise((resolve,reject) => { const timer = setTimeout(() => reject(Error('socket sync timeout')), 10000); socket.once('sync', () => { clearTimeout(timer); resolve() }); socket.once('connect_error', reject); socket.connect() })
  return socket
}
async function grant(headers, fileKey) {
  const session = await request(headers, '/ai/workspace-files/view-sessions', { hostType: 'agent', hostId: fixture.assistantIds[0], viewKey: 'spaces.views__spaces.workspace', runtimeScope: { projectId: headers['x-xpert-view-project-id'] ?? projectId } })
  const granted = await request(headers, `/ai/workspace-files/view-sessions/${session.sessionId}/grants`, { fileKey, purpose: 'download' })
  const target = new URL(granted.url, api); assert.equal(target.origin, new URL(api).origin)
  const parts = target.pathname.split('/workspace-files/content/')[1].split('/')
  return `${api}/ai/workspace-files/view-sessions/${parts[0]}/grants/${parts[1]}/content/${parts[2]}`
}
async function bytes(headers, url, expected = 200) { const response = await fetch(url, { headers }); assert.equal(response.status, expected); return Buffer.from(await response.arrayBuffer()) }
async function indexed(headers, spaceId, itemId) {
  for (let n=0;n<40;n++) {
    const status = await action(headers, 'knowledge.status', { spaceId }); const item = status.items.find(i=>i.itemId===itemId)
    if (item?.status === 'ready') return status
    if (item?.status === 'failed') throw Error(`index failed: ${item.error}`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw Error('index timeout')
}
try {
  const [owner, editor, outsider, admin] = await Promise.all(['owner','editor','outsider','admin'].map(login))
  const editorId = identity.testUsers.find(u=>u.name==='editor').userId
  const [first, second] = await Promise.all([tree(owner), tree(editor,fixture.assistantIds[1])])
  assert.equal(first.root.id, second.root.id); assert.equal(first.root.id, fixture.spaceId)
  const spaceId = first.root.id
  await request(outsider,`${host()}/data`,undefined,'GET',403)
  await request(owner,`${host(assistants.disabled)}/manifest`,undefined,'GET',[403,404])
  const unscoped = {...owner}; delete unscoped['x-xpert-view-project-id']
  assert.equal((await tree(unscoped)).requiresProject,true)
  record('two members and two Assistants share one Project Space; outsiders and missing capability denied')
  const folder = await action(owner,'item.create',{spaceId,title:`闭环验收-${stamp}`,kind:'folder'})
  const page = await action(owner,'item.create',{spaceId,parentId:folder.id,title:'发布计划',kind:'page',content:'发布日为周五。launchday friday。'})
  await action(owner,'item.create',{spaceId,parentId:folder.id,title:'发布计划',kind:'page',content:'must not overwrite'},409)
  const initial = await action(owner,'page.session',{itemId:page.id})
  const a = document(initial.state), b = document(initial.state)
  await Promise.all([action(owner,'page.update',{itemId:page.id,updateBase64:append(a,'Owner协作。')}),action(editor,'page.update',{itemId:page.id,updateBase64:append(b,'Editor协作。')},201,fixture.assistantIds[1])]);a.destroy();b.destroy()
  let current = await read(owner,page.id)
  assert(current.markdown.includes('Owner协作。') && current.markdown.includes('Editor协作。'))
  const file = await fileRead(editor,current.item.filePath); assert.equal(file.contents,current.markdown)
  record('concurrent CRDT edits merge and materialize to the shared Project Markdown file')
  const checkpoint = await action(owner,'page.checkpoint',{itemId:page.id,label:'验收初始版本'})
  const comment = await action(editor,'comment.create',{itemId:page.id,body:'已核对发布日',blockId:current.blocks[0].id})
  await action(editor,'comment.resolve',{commentId:comment.id,resolved:true})
  const patch = {itemId:page.id,mutationId:randomUUID(),expectedSequence:current.sequence,blockId:current.blocks[0].id,before:current.blocks[0].text,after:'发布日为下周一。',reason:'测试恢复'}
  const proposed = await action(owner,'proposal.create',patch)
  await action(editor,'proposal.decide',{proposalId:proposed.id,accept:true})
  await action(owner,'proposal.create',{...patch,mutationId:randomUUID()},409)
  current = await read(owner,page.id)
  await action(owner,'page.restore',{itemId:page.id,revisionId:checkpoint.id,expectedSequence:current.sequence})
  assert((await read(owner,page.id)).markdown.includes('周五'))
  record('comments, reviewed changes, stale sequence rejection and historical restoration')
  const local = document((await action(owner,'page.session',{itemId:page.id})).state)
  append(local,'本地未提交草稿。')
  await fileWrite(editor,current.item.filePath,'Assistant 在项目文件中修改。externalfile v1')
  assert.equal((await read(owner,page.id)).externalChange,true)
  await action(owner,'page.update',{itemId:page.id,updateBase64:Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')},409)
  let conflict = await action(owner,'page.conflict',{itemId:page.id})
  await action(owner,'page.reconcile',{itemId:page.id,choice:'document',expectedHash:conflict.diskHash,expectedSequence:conflict.sequence,localUpdate:Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')});local.destroy()
  current = await read(owner,page.id);assert(current.markdown.includes('本地未提交草稿。')); assert.equal(current.externalChange,false)
  await fileWrite(editor,current.item.filePath,'Assistant 文件版本。externalfile v2')
  conflict = await action(owner,'page.conflict',{itemId:page.id})
  await fileWrite(editor,current.item.filePath,'Assistant 文件版本。externalfile v3')
  await action(owner,'page.reconcile',{itemId:page.id,choice:'file',expectedHash:conflict.diskHash,expectedSequence:conflict.sequence},409)
  conflict = await action(owner,'page.conflict',{itemId:page.id})
  await action(owner,'page.reconcile',{itemId:page.id,choice:'file',expectedHash:conflict.diskHash,expectedSequence:conflict.sequence})
  assert((await read(owner,page.id)).markdown.includes('externalfile v3'))
  current = await read(owner,page.id)
  await action(owner,'page.restore',{itemId:page.id,revisionId:checkpoint.id,expectedSequence:current.sequence})
  record('external file edits freeze stale editors; both reconciliation choices preserve versions and local draft; stale hashes rejected')
  const externalForm = new FormData(); externalForm.set('path',folder.filePath); externalForm.set('file',new Blob(['## Assistant 文件\n\n多 Assistant 共用项目。sharedknowledge quasarflag = purple.'],{type:'text/markdown'}),'Assistant 创建的资料.md')
  const externalResponse=await fetch(`${api}${project}/workspace/file/upload`,{method:'POST',headers:editor,body:externalForm});assert(externalResponse.ok);const externalFile=await externalResponse.json()
  const externalPath = externalFile.filePath
  const discovered = (await tree(owner)).items.find(i=>i.filePath===externalPath)
  assert.equal(discovered.kind,'page');assert((await read(owner,discovered.id)).markdown.includes('quasarflag'))
  record('Project workspace files created outside the plugin appear as editable pages')
  const library = await action(owner,'knowledge.enable',{spaceId});await action(owner,'knowledge.refresh',{spaceId})
  await indexed(owner,spaceId,discovered.id)
  const matches = await action(editor,'knowledge.search',{spaceId,query:'quasarflag'})
  assert(matches.some(m=>m.itemId===discovered.id && m.text.includes('purple')))
  await fileWrite(editor,externalPath,'newversion stale index must disappear')
  assert(!(await action(owner,'knowledge.search',{spaceId,query:'quasarflag'})).some(m=>m.itemId===discovered.id))
  conflict = await action(owner,'page.conflict',{itemId:discovered.id})
  await action(owner,'page.reconcile',{itemId:discovered.id,choice:'file',expectedHash:conflict.diskHash,expectedSequence:conflict.sequence})
  await indexed(owner,spaceId,discovered.id)
  await request(outsider,`/knowledgebase/${library.knowledgebaseId}`,undefined,'GET',[403,404])
  record('built-in keyword ingestion without embeddings, indexed retrieval, stale-file filtering and governed library access')
  const payload=Buffer.from('binary\u0000attachment\n文件字节\n')
  const form=new FormData();form.set('input',JSON.stringify({spaceId,parentId:folder.id}));form.set('file',new Blob([payload],{type:'application/octet-stream'}),'fixture.bin')
  const upload=await fetch(`${api}${host()}/actions/file.upload/file`,{method:'POST',headers:owner,body:form});const uploaded=await upload.json();assert.equal(upload.status,201,JSON.stringify(uploaded))
  const downloadUrl=await grant(editor,`item:${uploaded.data.item.id}`);assert.deepEqual(await bytes(editor,downloadUrl),payload)
  const exported=await action(owner,'page.export',{itemId:page.id});assert((await bytes(editor,exported.url)).toString().includes('周五'))
  const collectedFolder=await action(owner,'item.create',{spaceId,parentId:folder.id,title:'归集成果',kind:'folder'})
  const collected=await action(owner,'artifact.collect',{mode:'copy',acknowledgeCopy:true,spaceId,parentId:collectedFolder.id,artifactId:exported.artifactId,versionId:exported.versionId})
  assert.equal((await action(editor,'artifact.open',{itemId:collected.id})).version.id,exported.versionId)
  assert((await bytes(owner,await grant(owner,`item:${collected.id}`))).toString().includes('周五'))
  record('binary upload/download bytes match; Artifact export and fixed-version collection retain content')
  const sheet=await action(owner,'editor.create',{spaceId,parentId:folder.id,title:'预算.xlsx',editorKey:'office.xlsx'})
  const sheetBefore=await action(editor,'editor.read',{itemId:sheet.id})
  const cells={sheetId:sheetBefore.document.sheets[0].id,cells:[{row:0,column:0,value:120},{row:0,column:1,value:'',formula:'A1*2'}]}
  await action(owner,'editor.save',{itemId:sheet.id,expectedVersionId:sheetBefore.versionId,patch:cells})
  await action(editor,'editor.save',{itemId:sheet.id,expectedVersionId:sheetBefore.versionId,patch:cells},409)
  const sheetAfter=await action(editor,'editor.read',{itemId:sheet.id});assert(sheetAfter.document.sheets[0].cells.some(c=>c.value===120));assert(sheetAfter.document.sheets[0].cells.some(c=>c.formula?.includes('A1*2')))
  const sheetVersions=await action(editor,'file.list',{itemId:sheet.id})
  const currentSheetBytes=await bytes(editor,await grant(editor,`item:${sheet.id}`))
  assert.equal(createHash('sha256').update(currentSheetBytes).digest('hex'),sheetVersions.find(v=>v.id===sheetAfter.versionId).sha256)
  record('Office editor retains values/formulas and rejects concurrent stale revisions')
  await action(owner,'item.edit',{itemId:folder.id,expectedVersion:folder.version,title:`已核验-${stamp}`})
  current=await read(owner,page.id);assert(current.item.filePath.startsWith(`已核验-${stamp}/`));assert.equal((await fileRead(editor,current.item.filePath)).contents,current.markdown)
  await action(owner,'item.edit',{itemId:folder.id,expectedVersion:folder.version+1,deleted:true})
  await action(owner,'page.read',{itemId:page.id},403)
  await action(owner,'item.edit',{itemId:folder.id,expectedVersion:folder.version+2,deleted:false})
  assert((await read(owner,page.id)).markdown.includes('周五'))
  record('folder rename, subtree trash and restore update real paths without losing files')
  await request(admin,`${project}/members/${editorId}`,{role:'member'},'PATCH')
  cleanup.push(()=>request(admin,`${project}/members`,{userId:editorId,role:'editor'}))
  assert.equal((await tree(editor)).canWrite,false);await read(editor,page.id)
  await action(editor,'item.create',{spaceId,title:'denied',kind:'page'},403)
  await request(admin,`${project}/members/${editorId}`,{role:'editor'},'PATCH')
  const revoked=await socketSession(editor,page.id), alive=await socketSession(owner,page.id)
  let received=0;revoked.on('update',()=>received++)
  await request(admin,`${project}/members/${editorId}`,undefined,'DELETE')
  const disconnected=new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('revoked socket remained connected')),10000);revoked.once('disconnect',()=>{clearTimeout(t);resolve()})})
  const d=document((await action(owner,'page.session',{itemId:page.id})).state)
  await action(owner,'page.update',{itemId:page.id,updateBase64:append(d,'撤权后的内容。')});d.destroy();await disconnected;assert.equal(received,0)
  for (const key of ['page.read','page.session','file.list']) await action(editor,key,{itemId:page.id},403)
  await action(editor,'knowledge.search',{spaceId,query:'friday'},403)
  await request(editor,`/knowledgebase/${library.knowledgebaseId}`,undefined,'GET',[403,404])
  assert([401,403,404].includes((await fetch(downloadUrl,{headers:editor})).status))
  assert([401,403,404].includes((await fetch(exported.url,{headers:editor})).status))
  await cleanup.pop()();alive.disconnect()
  record('read-only role and immediate member revocation cover HTTP, knowledge, old downloads and open WebSocket')
  const other=fixture.assistantIds[1];const unbound=await socketSession(editor,page.id,other)
  await request(admin,`${project}/xperts/${other}`,undefined,'DELETE')
  cleanup.push(()=>request(admin,`${project}/xperts/${other}`,{},'PUT'))
  await request(editor,`${host(other)}/data`,undefined,'GET',403)
  unbound.emit('sync-request',{stateVectorBase64:''})
  await new Promise(resolve=>setTimeout(resolve,700));assert.equal(unbound.connected,false)
  await cleanup.pop()()
  await action({...owner,'organization-id':randomUUID()},'page.read',{itemId:page.id},403)
  await action({...owner,'x-xpert-view-project-id':randomUUID()},'page.read',{itemId:page.id},[403,404])
  assert.equal((await read({...owner,'tenant-id':randomUUID()},page.id)).item.tenantId,identity.tenantId)
  record('Assistant unbinding invalidates its view/socket; cross-project/org denied; tenant comes from authenticated identity')
  if(process.env.SPACES_TEST_MODEL==='1') {
    current=await read(owner,page.id)
    const generated=await action(owner,'ai.rewrite',{itemId:page.id,blockId:current.blocks[0].id,expectedSequence:current.sequence,instruction:'润色成自然中文，保留发布日为周五的信息。'})
    assert.equal(generated.status,'pending');assert.equal((await read(owner,page.id)).sequence,current.sequence)
    await action(owner,'proposal.decide',{proposalId:generated.id,accept:true})
    const answer=await action(editor,'ai.answer',{resourceId:spaceId,query:'发布日是哪天？'})
    assert(answer.answer.includes('周五'));assert(answer.citations.some(c=>c.itemId===page.id))
    record('real model rewrite waits for review; accepted text is persisted and answers cite project documents')
  }
  if(process.env.SPACES_TEST_ARCHIVE==='1') {
    const archiveProject=await request(admin,'/xpert-project',{name:`归档验收-${stamp}`,
      projectType:{applicationKey:'platform',projectTypeKey:'space'},xpertIds:fixture.assistantIds,
      memberIds:[identity.testUsers.find(u=>u.name==='owner').userId]})
    const archivedPath=`/xpert-project/${archiveProject.id}`
    await request(admin,`${archivedPath}/owner`,{userId:identity.testUsers.find(u=>u.name==='owner').userId},'PATCH')
    const archiveHeaders={...owner,'x-xpert-view-project-id':archiveProject.id}
    const archiveSpace=(await tree(archiveHeaders)).root.id
    const copied=await action(archiveHeaders,'artifact.collect',{mode:'copy',acknowledgeCopy:true,spaceId:archiveSpace,artifactId:exported.artifactId,versionId:exported.versionId})
    assert((await bytes(archiveHeaders,await grant(archiveHeaders,`item:${copied.id}`))).toString().includes('周五'))
    const archivedPage=await action(archiveHeaders,'item.create',{spaceId:archiveSpace,title:'归档后保留',kind:'page',content:'归档后的只读文档。'})
    await request(admin,`${archivedPath}/archive`,{})
    const archivedTree=await tree(archiveHeaders)
    assert.equal(archivedTree.canWrite,false);assert.equal(archivedTree.canManage,false)
    assert((await read(archiveHeaders,archivedPage.id)).markdown.includes('只读文档'))
    await action(archiveHeaders,'item.create',{spaceId:archiveSpace,title:'denied',kind:'page'},403)
    await action(archiveHeaders,'knowledge.enable',{spaceId:archiveSpace},403)
    const archivedForm=new FormData();archivedForm.set('input',JSON.stringify({spaceId:archiveSpace}));archivedForm.set('file',new Blob(['denied']),'denied.txt')
    assert.equal((await fetch(`${api}${host()}/actions/file.upload/file`,{method:'POST',headers:archiveHeaders,body:archivedForm})).status,403)
    assert((await bytes(archiveHeaders,await grant(archiveHeaders,`item:${archivedPage.id}`))).toString().includes('只读文档'))
    record('cross-project Artifact copy verifies source access; archived Space remains readable and downloadable but rejects writes and uploads')
  }
  const finalPage=await read(owner,page.id)
  if(process.env.SPACES_TEST_REPORT)writeFileSync(process.env.SPACES_TEST_REPORT,JSON.stringify({completedAt:new Date().toISOString(),projectId,spaceId,pageId:page.id,filePath:finalPage.item.filePath,markdown:finalPage.markdown,sequence:finalPage.sequence,knowledgebaseId:library.knowledgebaseId,results},null,2),{mode:0o600})
  console.log(JSON.stringify({passed:results.length,pageId:page.id}))
} finally {sockets.forEach(s=>s.disconnect());for(const restore of cleanup.reverse())await restore()}
