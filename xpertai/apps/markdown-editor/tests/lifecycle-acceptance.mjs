import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { io } from 'socket.io-client'
const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw new Error('Set SPACES_TEST_DIRECTORY')
const { login, api, identity } = await import(pathToFileURL(`${directory}/probe.mjs`))
const f = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
const resourceId = f.item.id, project = `/xpert-project/${f.projectId}`, results = [], sockets = []
const h = Object.fromEntries(await Promise.all(['owner','editor','outsider','admin'].map(async name => [name, {
  ...await login(name), 'content-type': 'application/json', 'x-xpert-view-project-id': f.projectId
}])))
async function call(user, path, body, method = 'POST', status = [200,201,204]) {
  const r = await fetch(api + path, { method, headers: h[user], body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await r.text(), data = text ? JSON.parse(text) : null
  assert.ok(status.includes(r.status), `${method} ${path}: ${r.status} ${text.slice(0,400)}`)
  return data
}
const host = (assistant = 0, view = 'markdown.views__markdown.editor') => `/view-hosts/agent/${f.assistantIds[assistant]}/views/${view}`
const action = async (key, input = {}, user = 'owner', assistant = 0, view) => (await call(user, `${host(assistant,view)}/actions/${key}`, { input })).data
const review = (operation, input = {}) => call('owner', `/ai/assistants/${f.assistantIds[0]}/projects/${f.projectId}/content/${resourceId}/${operation}`, input)
const get = () => action('document.read', { resourceId })
const check = async (name, work) => { await work(); results.push({ name, passed: true }); console.log(`PASS ${name}`) }
async function socketFor(user, assistant = 0) {
  const {session} = await action('document.session', {resourceId}, user, assistant)
  const socket = io(session.connectionUrl, {autoConnect:false, transports:['websocket'],auth:{sessionId:session.sessionId,clientKey:session.clientKey,documentId:session.documentId}})
  sockets.push(socket)
  await new Promise((resolve,reject) => {const timer=setTimeout(()=>reject(Error('sync timeout')),10000);socket.once('sync',()=>{clearTimeout(timer);resolve()});socket.once('connect_error',reject);socket.connect()})
  return socket
}
const editorId = identity.testUsers.find(u=>u.name==='editor').userId
let restoreMember = false, restoreAssistant = false
try {
  await check('managed Markdown rejects whole-file writes and preserves exact bytes', async () => {
    const state = await get()
    await call('owner', `${project}/workspace/file`, { path: state.document.path, content: 'must not overwrite' }, 'PUT', [409])
    const file = await call('editor', `${project}/workspace/file?path=${encodeURIComponent(state.document.path)}`, undefined, 'GET')
    assert.equal(createHash('sha256').update(file.contents).digest('hex'), state.document.fileHash)
  })
  await check('external files freeze editing and reconcile into a new epoch without losing the external copy', async () => {
    const state = await get(), path = `${directory}/files/${identity.tenantId}/project/${f.projectId}/${state.document.path}`
    const external = `${state.markdown}\n\n外部写入冲突验收。`, hash = createHash('sha256').update(external).digest('hex')
    await writeFile(path, external)
    const conflict = await review('review'); assert.equal(conflict.externalChange,true); assert.equal(conflict.external.hash,hash)
    assert.equal((await action('document.session',{resourceId})).session.access,'read')
    await review('reconcile',{choice:'file',expectedHash:hash,expectedSequence:conflict.document.sequence,epoch:conflict.document.epoch})
    const next = await get(); assert.match(next.markdown,/外部写入冲突验收/); assert.equal(next.document.epoch,state.document.epoch+1)
    assert.equal(await readFile(`${directory}/files/${identity.tenantId}/project/${f.projectId}/.apps/content/external/${resourceId}/${hash}.md`,'utf8'),external)
  })
  await check('rename, trash and restore preserve resource identity and advance room epoch', async () => {
    const view='spaces.views__spaces.workspace'
    let item=await action('item.edit',{itemId:resourceId,expectedVersion:f.item.version,title:`已验收 Tiptap 协作文档 ${resourceId.slice(0,8)}`},'owner',0,view)
    assert.equal((await get()).document.id,resourceId); assert.equal((await get()).document.path,item.filePath)
    item=await action('item.edit',{itemId:resourceId,expectedVersion:item.version,deleted:true},'owner',0,view)
    await call('editor',`${host()}/actions/document.read`,{input:{resourceId}},'POST',[403,404])
    item=await action('item.edit',{itemId:resourceId,expectedVersion:item.version,deleted:false},'owner',0,view)
    f.item=item; await writeFile(`${directory}/editor-acceptance-fixture.json`,JSON.stringify(f,null,2))
    assert.match((await get()).markdown,/外部写入冲突验收/)
  })
  await check('read-only member gets read session and cannot write or comment', async () => {
    restoreMember=true; await call('admin',`${project}/members/${editorId}`,{role:'member'},'PATCH')
    const state=await action('document.session',{resourceId},'editor');assert.equal(state.canWrite,false);assert.equal(state.session.access,'read')
    await call('editor',`/ai/assistants/${f.assistantIds[0]}/projects/${f.projectId}/content/${resourceId}/comment`,{body:'denied'},'POST',[403])
    await call('admin',`${project}/members/${editorId}`,{role:'editor'},'PATCH');restoreMember=false
  })
  await check('folder moves and trash/restore retain managed descendant identity and bytes', async () => {
    const view='spaces.views__spaces.workspace'
    let folder=await action('item.create',{spaceId:f.spaceId,kind:'folder',title:`目录验收 ${Date.now()}`},'owner',0,view)
    const child=await action('item.create',{spaceId:f.spaceId,parentId:folder.id,kind:'page',title:'目录内的文档',content:'# 目录协作\n\n移动后保持内容。'},'owner',0,view)
    const opened=await action('document.open',{itemId:child.id},'owner',0,view)
    folder=await action('item.edit',{itemId:folder.id,expectedVersion:folder.version,title:folder.title+' 已移动'},'owner',0,view)
    let moved=await action('document.read',{resourceId:child.id})
    assert.equal(moved.document.id,child.id);assert.equal(moved.document.fileHash,opened.document.fileHash)
    assert.equal(moved.document.path,`${folder.filePath}/目录内的文档.md`)
    folder=await action('item.edit',{itemId:folder.id,expectedVersion:folder.version,deleted:true},'owner',0,view)
    await call('editor',`${host()}/actions/document.read`,{input:{resourceId:child.id}},'POST',[403,404])
    folder=await action('item.edit',{itemId:folder.id,expectedVersion:folder.version,deleted:false},'owner',0,view)
    moved=await action('document.read',{resourceId:child.id})
    assert.equal(moved.document.fileHash,opened.document.fileHash);assert.ok(moved.document.epoch>opened.document.epoch)
  })
  await check('unsupported Markdown migration rejects editing without changing original bytes', async () => {
    const content='# 保留原件\n\n![图片](./asset.png)\n',view='spaces.views__spaces.workspace'
    const item=await action('item.create',{spaceId:f.spaceId,kind:'page',title:`语法保留验收 ${Date.now()}`,content},'owner',0,view)
    const before=await call('owner',`${project}/workspace/file?path=${encodeURIComponent(item.filePath)}`,undefined,'GET')
    await call('owner',`${host(0,view)}/actions/document.open`,{input:{itemId:item.id}},'POST',[400,422])
    const after=await call('owner',`${project}/workspace/file?path=${encodeURIComponent(item.filePath)}`,undefined,'GET')
    assert.equal(after.contents,before.contents);assert.equal(after.contents,content)
  })
  await check('revocation blocks HTTP and disconnects an already-open collaboration socket', async () => {
    const socket=await socketFor('editor'), live=await socketFor('owner');let updates=0;socket.on('update',()=>updates++)
    restoreMember=true;await call('admin',`${project}/members/${editorId}`,undefined,'DELETE')
    const disconnected=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('revoked socket active')),10000);socket.once('disconnect',()=>{clearTimeout(timer);resolve()})})
    socket.emit('sync-request',{stateVectorBase64:''});await disconnected;assert.equal(updates,0)
    for(const key of ['document.read','document.session','document.history'])await call('editor',`${host()}/actions/${key}`,{input:{resourceId}},'POST',[403,404])
    await call('admin',`${project}/members`,{userId:editorId,role:'editor'});restoreMember=false;live.disconnect()
  })
  await check('Assistant unbinding invalidates its existing socket and view', async () => {
    const socket=await socketFor('editor',1);restoreAssistant=true
    await call('admin',`${project}/xperts/${f.assistantIds[1]}`,undefined,'DELETE')
    const disconnected=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('unbound socket active')),10000);socket.once('disconnect',()=>{clearTimeout(timer);resolve()})})
    socket.emit('sync-request',{stateVectorBase64:''});await disconnected
    await call('editor',`${host(1)}/actions/document.read`,{input:{resourceId}},'POST',[403,404])
    await call('admin',`${project}/xperts/${f.assistantIds[1]}`,{},'PUT');restoreAssistant=false
  })
} finally {
  for(const socket of sockets)socket.disconnect()
  if(restoreMember)await call('admin',`${project}/members`,{userId:editorId,role:'editor'})
  if(restoreAssistant)await call('admin',`${project}/xperts/${f.assistantIds[1]}`,{},'PUT')
  await writeFile(`${directory}/editor-lifecycle-acceptance.json`,JSON.stringify({resourceId,results},null,2))
}
