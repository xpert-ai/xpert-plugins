import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import * as Y from 'yjs'
import { SCHEMA_VERSION } from '../dist/schema.js'
import { MarkdownDocumentModel } from '../dist/model.js'
const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw Error('Set SPACES_TEST_DIRECTORY to the private local fixture')
const { login, api, identity } = await import(pathToFileURL(`${directory}/probe.mjs`))
const fixture = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
const headers = Object.fromEntries(await Promise.all(['owner', 'editor', 'outsider', 'admin'].map(async user => [user, {
  ...await login(user), 'content-type': 'application/json', 'x-xpert-view-project-id': fixture.projectId, origin: 'http://localhost:4200'
}])))
const view = 'markdown.views__markdown.editor', spaces = 'spaces.views__spaces.workspace', results = []
const host = (selected = view, assistant = 0) => `/view-hosts/agent/${fixture.assistantIds[assistant]}/views/${selected}`
async function request(path, input, user = 'owner', method = 'POST') {
  const r = await fetch(api + path, { method, headers: headers[user], body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(30000) })
  const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null, response: r }
}
async function ok(path, input, user, method) { const r = await request(path, input, user, method); assert.ok(r.status < 300, `${path}: ${r.status} ${JSON.stringify(r.body).slice(0,300)}`); return r.body }
const action = async (key, input, user = 'owner', selected = view, assistant = 0) => (await ok(`${host(selected,assistant)}/actions/${key}`, { input }, user)).data
const check = async (name, work) => { await work(); results.push(name); console.log(`PASS ${name}`) }
const stamp = `资源验收-${Date.now()}`, png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=', 'base64')
let page, image, file, extra, renamed, latest, editorSession, restoreRole = false
const editorId = identity.testUsers.find(user => user.name === 'editor').userId
const uri = item => `xpert-resource://v1/${item.kind}/${item.providerKey}/${item.resourceId}`
async function upload(kind, name, bytes, user = 'owner') {
  const form = new FormData(); form.set('input', JSON.stringify({ resourceId: page.id, kind })); form.set('file', new Blob([bytes], { type: kind === 'image' ? 'image/png' : 'text/plain' }), name)
  const h = { ...headers[user] }; delete h['content-type']
  const r = await fetch(api + host() + '/actions/reference.upload/file', { method: 'POST', headers: h, body: form }); return { status: r.status, body: await r.json() }
}
async function session(user) {
  const r = await request('/workspace-files/view-sessions', { hostType: 'agent', hostId: fixture.assistantIds[0], viewKey: view, runtimeScope: { projectId: fixture.projectId } }, user)
  assert.ok(r.status < 300); return { ...r.body, user, cookie: r.response.headers.get('set-cookie').split(';')[0] }
}
async function grant(s, item, purpose = 'download') {
  return ok(`/workspace-files/view-sessions/${s.sessionId}/grants`, { fileKey: `reference:${page.id}:${uri(item)}`, purpose }, s.user)
}
async function bytes(s, g) { return fetch(g.url, { headers: { cookie: s.cookie, origin: 'http://localhost:4200' }, signal: AbortSignal.timeout(15000) }) }
try {
  await check('upload image and attachments to actual project workspace', async () => {
    page = await action('item.create', { spaceId: fixture.spaceId, kind: 'page', title: stamp, content: '# 项目资源验收\n\n协作正文。' }, 'owner', spaces)
    await action('document.open', { itemId: page.id }, 'owner', spaces)
    for (const [kind, name, content] of [['image', `${stamp}.png`, png], ['file', `${stamp}.txt`, Buffer.from('附件中文内容')], ['file', `${stamp}-2.txt`, Buffer.from('分页附件')]]) {
      const r = await upload(kind, name, content); assert.ok(r.status < 300 && r.body.success, JSON.stringify(r.body));
      if (kind === 'image') image = r.body.data; else if (!file) file = r.body.data; else extra = r.body.data
    }
    assert.equal(image.mimeType, 'image/png'); assert.equal(file.mimeType, 'application/octet-stream')
  })
  await check('server pagination and literal search have no duplicate references', async () => {
    let cursor, seen = []
    do {
      const result = await action('reference.list', { resourceId: page.id, kind: 'file', query: stamp, pageSize: 1, ...(cursor ? {cursor}: {}) })
      seen.push(...result.items.map(item => item.resourceId)); cursor = result.nextCursor
    } while (cursor)
    assert.equal(seen.length, 3); assert.equal(new Set(seen).size, 3)
    assert.equal((await action('reference.list', { resourceId: page.id, kind: 'file', query: '%_', pageSize: 25 })).items.length, 0)
    assert.ok((await action('reference.list', { resourceId: page.id, kind: 'page', query: stamp, pageSize: 25 })).items.some(item => item.resourceId === page.id))
  })
  await check('preview and download reauthorize and return original bytes', async () => {
    const s = await session('owner'); editorSession = await session('editor')
    const g = await grant(s, image, 'preview'), r = await bytes(s,g); assert.equal(r.status,200); assert.equal(r.headers.get('content-type'),'image/png'); assert.deepEqual(Buffer.from(await r.arrayBuffer()),png)
    const attachment = await bytes(editorSession, await grant(editorSession,file)); assert.equal(attachment.status,200); assert.equal(await attachment.text(),'附件中文内容'); assert.match(attachment.headers.get('content-disposition'),/^attachment/)
  })
  await check('two actors merge image insertion and text edits and persist durable Markdown', async () => {
    const state = await action('document.session', { resourceId: page.id, schemaVersion: SCHEMA_VERSION })
    const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state.stateBase64,'base64')); const vector = Y.encodeStateVector(doc)
    const imageBlock = new Y.XmlElement('paragraph'); imageBlock.setAttribute('blockId',randomUUID())
    const imageNode = new Y.XmlElement('image'); imageNode.setAttribute('src',uri(image)); imageNode.setAttribute('alt','验收图片'); imageNode.setAttribute('title',null); imageBlock.insert(0,[imageNode])
    const attachment = new Y.XmlElement('paragraph'); attachment.setAttribute('blockId',randomUUID()); const text = new Y.XmlText(); text.insert(0,'下载附件'); text.format(0,4,{ link: { href:uri(file) } }); attachment.insert(0,[text])
    doc.getXmlFragment('body').push([imageBlock,attachment])
    const patch = new MarkdownDocumentModel().patch(state.stateBase64,{blockId:state.blocks[1].id,before:'协作正文。',after:'另一位成员编辑了正文。'})
    const base = { resourceId:page.id,epoch:state.document.epoch,schemaVersion:SCHEMA_VERSION }
    await Promise.all([action('document.update',{...base,updateBase64:Buffer.from(Y.encodeStateAsUpdate(doc,vector)).toString('base64')}),action('document.update',{...base,updateBase64:patch},'editor',view,1)])
    doc.destroy()
    const deadline = Date.now()+20000
    do { latest=await action('document.read',{resourceId:page.id}); if(latest.document.status==='ready'&&latest.markdown.includes(uri(image))&&latest.markdown.includes('另一位成员'))break;await new Promise(resolve=>setTimeout(resolve,200)) } while(Date.now()<deadline)
    assert.equal(latest.document.status,'ready');assert.ok(latest.markdown.includes(uri(image)));assert.ok(latest.markdown.includes(uri(file)));assert.match(latest.markdown,/另一位成员/)
    const disk=await ok(`/xpert-project/${fixture.projectId}/workspace/file?path=${encodeURIComponent(latest.document.path)}`,undefined,'owner','GET')
    assert.equal(createHash('sha256').update(disk.contents).digest('hex'),latest.document.fileHash)
    assert.ok(!disk.contents.includes('http://'));assert.equal(new MarkdownDocumentModel().read(new MarkdownDocumentModel().initialize(disk.contents)).markdown,latest.markdown)
  })
  await check('rename, folder move, trash and restore retain identity and invalidate stale grants', async () => {
    const old = await grant(editorSession,file)
    const folder = await action('item.create',{spaceId:fixture.spaceId,kind:'folder',title:`${stamp}-目录`},'owner',spaces)
    renamed = await action('item.edit',{itemId:file.resourceId,expectedVersion:1,title:`${stamp}-已改名.txt`,parentId:folder.id},'owner',spaces)
    assert.equal(renamed.id,file.resourceId);assert.equal((await bytes(editorSession,old)).status,404)
    assert.equal((await bytes(editorSession,await grant(editorSession,file))).status,200)
    renamed=await action('item.edit',{itemId:renamed.id,expectedVersion:renamed.version,deleted:true},'owner',spaces)
    const denied=await request(`/workspace-files/view-sessions/${editorSession.sessionId}/grants`,{fileKey:`reference:${page.id}:${uri(file)}`,purpose:'download'},'editor');assert.ok([403,404].includes(denied.status))
    renamed=await action('item.edit',{itemId:renamed.id,expectedVersion:renamed.version,deleted:false},'owner',spaces)
    assert.equal((await bytes(editorSession,await grant(editorSession,file))).status,200)
  })
  await check('spoofed images, outsider access and read-only uploads are denied', async () => {
    assert.equal((await upload('image','伪造.png',Buffer.from('<svg/>'))).status,400)
    assert.ok([403,404].includes((await request(host()+'/actions/reference.list',{input:{resourceId:page.id,kind:'file',query:'',pageSize:25}},'outsider')).status))
    restoreRole=true;await ok(`/xpert-project/${fixture.projectId}/members/${editorId}`,{role:'member'},'admin','PATCH')
    assert.ok([400,403].includes((await upload('file','不得上传.txt',Buffer.from('denied'),'editor')).status))
    await ok(`/xpert-project/${fixture.projectId}/members/${editorId}`,{role:'editor'},'admin','PATCH');restoreRole=false
  })
  await check('membership revocation invalidates an already issued attachment grant', async () => {
    const g=await grant(editorSession,file);restoreRole=true
    await ok(`/xpert-project/${fixture.projectId}/members/${editorId}`,undefined,'admin','DELETE')
    assert.ok([401,403,404].includes((await bytes(editorSession,g)).status))
    await ok(`/xpert-project/${fixture.projectId}/members`,{userId:editorId,role:'editor'},'admin');restoreRole=false
  })
} finally {
  if (restoreRole) await ok(`/xpert-project/${fixture.projectId}/members`,{userId:editorId,role:'editor'},'admin')
  await writeFile(`${directory}/references-acceptance.json`,JSON.stringify({page,image,file,extra,renamed,projectId:fixture.projectId,results},null,2))
}
console.log(`Verified ${results.length} live scenarios; fixture saved privately.`)
