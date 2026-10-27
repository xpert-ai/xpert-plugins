import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'
import { io } from 'socket.io-client'
import { createCollaborationClient, createSocketIoTransportAdapter, createCollaborationPresenceStore } from '@xpert-ai/plugin-sdk/collaboration-client'
import { MarkdownDocumentModel } from '../dist/model.js'
import { SCHEMA_VERSION } from '../dist/schema.js'

// Real accounts, real WebSockets, real project files. No browser/session tokens in output.
const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw Error('Set SPACES_TEST_DIRECTORY to the private acceptance environment')
const { login, api } = await import(pathToFileURL(`${directory}/probe.mjs`))
const f = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
const headers = Object.fromEntries(await Promise.all(['owner', 'editor', 'outsider'].map(async user => [user,
  { ...await login(user), 'content-type': 'application/json', 'x-xpert-view-project-id': f.projectId }])))
async function request(key, input, user = 'owner', assistant = 0, view = 'markdown.views__markdown.editor') {
  const r = await fetch(`${api}/view-hosts/agent/${f.assistantIds[assistant]}/views/${view}/actions/${key}`,
    { method: 'POST', headers: headers[user], body: JSON.stringify({ input }), signal: AbortSignal.timeout(30000) })
  return { status: r.status, body: await r.json() }
}
async function action(...args) { const r = await request(...args); assert.ok(r.status < 300 && r.body.success, `${args[0]}: ${r.status}`); return r.body.data }
async function until(work, label) { const end = Date.now() + 20000; do { if (await work()) return; await new Promise(r => setTimeout(r, 100)) } while (Date.now() < end); throw Error(`Timeout: ${label}`) }
const results = [], peers = [], model = new MarkdownDocumentModel()
const check = async (name, work) => { await work(); results.push(name); console.log(`PASS ${name}`) }
const item = await action('item.create', { spaceId: f.spaceId, kind: 'page', title: `双账号实时协作验收 ${Date.now()}`,
  content: '# 双账号实时协作验收\n\n共同编辑：\n\n甲方工作区：\n\n乙方工作区：\n\n- [ ] 完成协同验收\n\n$$\nx^2\n$$' }, 'owner', 0, 'spaces.views__spaces.workspace')
const resourceId = item.id
await action('document.open', { itemId: resourceId }, 'owner', 0, 'spaces.views__spaces.workspace')
const encode = doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
const content = peer => model.read(encode(peer.doc)).markdown
async function peer(user, assistant) {
  const state = await action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, user, assistant)
  const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state.stateBase64, 'base64'))
  const session = state.session, errors = [], events = { updates: 0, remoteUpdates: 0, syncs: 0 }, presence = createCollaborationPresenceStore({ selfActor: session.actor })
  const socket = io(session.connectionUrl, { autoConnect: false, transports: ['websocket'], reconnection: false,
    auth: { sessionId: session.sessionId, clientKey: session.clientKey, documentId: session.documentId } })
  socket.on('update', event => { events.updates++; if (event.presenceId !== session.actor.presenceId) events.remoteUpdates++ }); socket.on('sync', () => events.syncs++)
  const client = createCollaborationClient({ session, transport: createSocketIoTransportAdapter(socket),
    document: { applyUpdate: (update, origin) => Y.applyUpdate(doc, update, origin), encodeStateVector: () => Y.encodeStateVector(doc), mergeUpdates: Y.mergeUpdates, onUpdate: () => () => {} },
    onPresence: presence.upsert, onPresenceSnapshot: (rows, meta) => presence.replace(rows, meta.selfClientId), onPresenceRemove: presence.remove,
    onError: e => errors.push(e.message), initialPresence: { mode: 'edit', focus: { kind: 'document', fieldKey: 'body' } } })
  const p = { user, assistant, state, doc, socket, client, presence, errors, events }; peers.push(p); client.connect()
  await until(() => events.syncs > 0, 'initial WebSocket sync'); return p
}
function edit(p, work) { const vector = Y.encodeStateVector(p.doc); work(p.doc.getXmlFragment('body')); return Buffer.from(Y.encodeStateAsUpdate(p.doc, vector)).toString('base64') }
const send = (p, updateBase64) => action('document.update', { resourceId, epoch: p.state.document.epoch, schemaVersion: SCHEMA_VERSION, updateBase64 }, p.user, p.assistant)
let a, b
try {
  await check('two authenticated users and two Assistants receive live room presence', async () => {
    a = await peer('owner', 0); b = await peer('editor', 1)
    assert.equal(a.state.session.documentId, b.state.session.documentId)
    assert.notEqual(a.state.session.actor.presenceId, b.state.session.actor.presenceId)
    await until(() => a.presence.snapshot().collaborators.length === 2 && b.presence.snapshot().collaborators.length === 2, 'two distinct users online')
  })
  await check('same-position concurrent edits converge through WebSocket broadcasts without reload', async () => {
    const first = edit(a, body => body.get(1).get(0).insert(5, '【甲同时输入】'))
    const second = edit(b, body => body.get(1).get(0).insert(5, '【乙同时输入】'))
    await Promise.all([send(a, first), send(b, second)])
    await until(() => content(a) === content(b) && content(a).includes('【甲同时输入】') && content(a).includes('【乙同时输入】'), 'concurrent merge')
    assert.ok(a.events.remoteUpdates > 0 && b.events.remoteUpdates > 0)
    assert.equal((await send(a, first)).duplicate, true)
  })
  await check('remote cursor identity and relative selection arrive at the other user', async () => {
    const text = a.doc.getXmlFragment('body').get(2).get(0)
    const pos = Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text, 2))).toString('base64')
    a.client.setPresence({ selection: { kind: 'text', fieldKey: 'body', anchorRelativeBase64: pos, headRelativeBase64: pos } })
    await until(() => b.presence.snapshot().remoteSessions.some(p => p.presenceId === a.state.session.actor.presenceId && p.selection?.anchorRelativeBase64 === pos), 'cursor presence')
  })
  await check('task and formula edits from different users converge and materialize', async () => {
    const task = edit(a, body => body.toArray().find(n => n.nodeName === 'taskList').get(0).setAttribute('checked', true))
    const math = edit(b, body => body.toArray().find(n => n.nodeName === 'blockMath').setAttribute('latex', 'x^2+y^2=z^2'))
    await Promise.all([send(a, task), send(b, math)])
    await until(() => content(a) === content(b) && content(a).includes('[x]') && content(a).includes('z^2'), 'rich node merge')
  })
  await check('disconnect removes presence; reconnect repairs missed updates and preserves buffered edits', async () => {
    b.socket.disconnect()
    await until(() => a.presence.snapshot().collaborators.length === 1, 'departed presence removed')
    const buffered = edit(b, body => body.get(3).get(0).insert(body.get(3).get(0).length, '【重连保留】'))
    await send(a, edit(a, body => body.get(2).get(0).insert(body.get(2).get(0).length, '【断线期间更新】')))
    b.socket.connect(); await until(() => content(b).includes('【断线期间更新】'), 'reconnect sync')
    await send(b, buffered)
    await until(() => content(a) === content(b) && content(a).includes('【重连保留】'), 'buffered recovery')
    await until(() => a.presence.snapshot().collaborators.length === 2, 'presence restored')
  })
  await check('outsider cannot obtain a collaboration session or submit edits', async () => {
    for (const key of ['document.session', 'document.update']) {
      const r = await request(key, { resourceId, schemaVersion: SCHEMA_VERSION, epoch: a.state.document.epoch, updateBase64: 'AAA=' }, 'outsider')
      assert.ok([403, 404].includes(r.status))
    }
  })
  await check('both clients and persisted Markdown have identical final content and file hash', async () => {
    let saved
    await until(async () => { saved = await action('document.read', { resourceId }); return saved.document.status === 'ready' && saved.markdown === content(a) }, 'file publication')
    assert.equal(saved.markdown, content(b)); assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, [])
    const reopened = await action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, 'editor', 1)
    assert.equal(model.read(reopened.stateBase64).markdown, saved.markdown)
    const r = await fetch(`${api}/xpert-project/${f.projectId}/workspace/file?path=${encodeURIComponent(saved.document.path)}`, { headers: headers.owner })
    assert.ok(r.ok); const file = await r.json(); assert.equal(file.contents, saved.markdown)
    assert.equal(createHash('sha256').update(file.contents).digest('hex'), saved.document.fileHash)
  })
} finally {
  if (results.length < 7) console.log(JSON.stringify(peers.map(p => ({user:p.user,markdown:content(p),events:p.events,errors:p.errors})),null,2))
  for (const p of peers) { p.client.disconnect(); p.doc.destroy() }
  await writeFile(`${directory}/collaboration-live-fixture.json`, JSON.stringify({ resourceId, projectId: f.projectId, assistantIds: f.assistantIds, title: item.title, results }, null, 2))
}
