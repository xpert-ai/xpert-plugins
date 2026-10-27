// Uses a document already imported through the browser. Never creates a substitute test page.
// The private directory supplies probe.mjs and feishu-imported-resource.json; no credentials are logged.
// Use a fresh browserMarker for each run so persisted text cannot masquerade as a new UI edit.
// Run the separate source-change acceptance after this check: this run expects the imported source snapshot to stay unchanged.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'
import { io } from 'socket.io-client'
import { createCollaborationClient, createSocketIoTransportAdapter, createCollaborationPresenceStore } from '@xpert-ai/plugin-sdk/collaboration-client'
import { MarkdownDocumentModel } from '../dist/model.js'
import { SCHEMA_VERSION } from '../dist/schema.js'

const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw Error('Set SPACES_TEST_DIRECTORY to the private acceptance environment')
const { login, api } = await import(pathToFileURL(`${directory}/probe.mjs`))
const f = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
const fixture = JSON.parse(await readFile(`${directory}/feishu-imported-resource.json`, 'utf8'))
const { resourceId, origin, snapshot, locator, browserMarker } = fixture
assert.ok(resourceId && origin && snapshot && locator)
const headers = Object.fromEntries(await Promise.all(['owner', 'editor', 'outsider'].map(async user => [user,
  { ...await login(user), 'content-type': 'application/json', 'x-xpert-view-project-id': f.projectId }])))
const spacesView = 'spaces.views__spaces.workspace', markdownView = 'markdown.views__markdown.editor'
async function request(key, input, user = 'owner', assistant = 0, view = markdownView) {
  const r = await fetch(`${api}/view-hosts/agent/${f.assistantIds[assistant]}/views/${view}/actions/${key}`,
    { method: 'POST', headers: headers[user], body: JSON.stringify({ input }), signal: AbortSignal.timeout(30000) })
  return { status: r.status, body: await r.json() }
}
async function action(...args) { const r = await request(...args); assert.ok(r.status < 300 && r.body.success, `${args[0]}: ${r.status}`); return r.body.data }
async function tree() {
  const r = await fetch(`${api}/view-hosts/agent/${f.assistantIds[0]}/views/${spacesView}/data`, { headers: headers.owner })
  assert.ok(r.ok); return (await r.json()).meta.items
}
async function until(work, label, timeout = 20000) {
  const end = Date.now() + timeout
  do { if (await work()) return; await new Promise(r => setTimeout(r, 100)) } while (Date.now() < end)
  throw Error(`Timeout: ${label}`)
}
const results = [], peers = [], model = new MarkdownDocumentModel()
const check = async (name, work) => { await work(); results.push(name); console.log(`PASS ${name}`) }
const encode = doc => Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
const content = p => model.read(encode(p.doc)).markdown
async function peer(user, assistant) {
  const state = await action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, user, assistant)
  const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state.stateBase64, 'base64'))
  const session = state.session, errors = [], events = { remoteUpdates: 0, syncs: 0 }
  const presence = createCollaborationPresenceStore({ selfActor: session.actor })
  const socket = io(session.connectionUrl, { autoConnect: false, transports: ['websocket'], reconnection: false,
    auth: { sessionId: session.sessionId, clientKey: session.clientKey, documentId: session.documentId } })
  socket.on('update', event => { if (event.presenceId !== session.actor.presenceId) events.remoteUpdates++ })
  socket.on('sync', () => events.syncs++)
  const client = createCollaborationClient({ session, transport: createSocketIoTransportAdapter(socket),
    document: { applyUpdate: (update, origin) => Y.applyUpdate(doc, update, origin), encodeStateVector: () => Y.encodeStateVector(doc), mergeUpdates: Y.mergeUpdates, onUpdate: () => () => {} },
    onPresence: presence.upsert, onPresenceSnapshot: (rows, meta) => presence.replace(rows, meta.selfClientId), onPresenceRemove: presence.remove,
    onError: e => errors.push(e.message), initialPresence: { mode: 'edit', focus: { kind: 'document', fieldKey: 'body' } } })
  const p = { user, assistant, state, doc, socket, client, presence, errors, events }; peers.push(p); client.connect()
  await until(() => events.syncs > 0, 'initial WebSocket sync'); return p
}
function text(p) {
  const paragraph = p.doc.getXmlFragment('body').toArray().find(n => n instanceof Y.XmlElement && n.nodeName === 'paragraph' && n.get(0) instanceof Y.XmlText)
  assert.ok(paragraph); return paragraph.get(0)
}
function edit(p, value) {
  const vector = Y.encodeStateVector(p.doc); text(p).insert(0, value)
  return Buffer.from(Y.encodeStateAsUpdate(p.doc, vector)).toString('base64')
}
const send = (p, updateBase64) => action('document.update', { resourceId, epoch: p.state.document.epoch, schemaVersion: SCHEMA_VERSION, updateBase64 }, p.user, p.assistant)
const sees = (p, other) => p.presence.snapshot().remoteSessions.some(s => s.presenceId === other.state.session.actor.presenceId)
let a, b, finalHash
try {
  await check('imported resource retains the real source identity, revision, hash and project Markdown file', async () => {
    const item = (await tree()).find(x => x.id === resourceId)
    assert.deepEqual(item.importOrigin, origin); assert.equal(origin.documentId, snapshot.id)
    assert.equal(origin.revision, snapshot.revision); assert.equal(origin.contentHash, snapshot.contentHash)
    assert.equal(item.editorKey, 'markdown.tiptap'); assert.match(item.filePath, /\.md$/u)
    const saved = await action('document.read', { resourceId }); assert.match(saved.markdown, /SOURCE\\?-V1/u)
    if (browserMarker) assert.ok(!saved.markdown.includes(browserMarker), 'Use a fresh browserMarker before starting a new browser acceptance run')
  })
  await check('two real users through two Assistants join the imported document and receive presence', async () => {
    a = await peer('owner', 0); b = await peer('editor', 1)
    assert.equal(a.state.session.documentId, b.state.session.documentId)
    assert.notEqual(a.state.session.actor.presenceId, b.state.session.actor.presenceId)
    await until(() => sees(a, b) && sees(b, a), 'peer presence')
  })
  await check('same-position concurrent edits converge and duplicate updates are idempotent', async () => {
    const first = edit(a, '【成员甲并发输入】'), second = edit(b, '【成员乙并发输入】')
    await Promise.all([send(a, first), send(b, second)])
    await until(() => content(a) === content(b) && content(a).includes('【成员甲并发输入】') && content(a).includes('【成员乙并发输入】'), 'concurrent merge')
    assert.ok(a.events.remoteUpdates && b.events.remoteUpdates); assert.equal((await send(a, first)).duplicate, true)
    const pos = Buffer.from(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(text(b), 2))).toString('base64')
    b.client.setPresence({ selection: { kind: 'text', fieldKey: 'body', anchorRelativeBase64: pos, headRelativeBase64: pos } })
    await until(() => a.presence.snapshot().remoteSessions.some(s => s.presenceId === b.state.session.actor.presenceId && s.selection?.anchorRelativeBase64 === pos), 'remote cursor')
  })
  if (browserMarker) await check('browser Tiptap input reaches both real WebSocket clients without reloading', async () => {
    console.log('READY browser input and presence screenshot')
    await until(() => content(a).includes(browserMarker) && content(b).includes(browserMarker) && content(a) === content(b), 'browser input broadcast', 180000)
  })
  await check('disconnect removes presence and reconnect merges missed and buffered edits', async () => {
    b.socket.disconnect(); await until(() => !sees(a, b), 'presence removal')
    const buffered = edit(b, '【离线编辑保留】')
    await send(a, edit(a, '【断线期间更新】'))
    b.socket.connect(); await until(() => content(b).includes('【断线期间更新】'), 'reconnect state sync')
    await send(b, buffered)
    await until(() => content(a) === content(b) && content(a).includes('【离线编辑保留】') && sees(a, b), 'buffered merge')
  })
  await check('outsider cannot preview, import, read or edit this project document', async () => {
    const denied = [
      ['source.preview', { bindingId: origin.bindingId, locator }, spacesView],
      ['source.import', { bindingId: origin.bindingId, locator, spaceId: f.spaceId, parentId: null, requestId: resourceId, expectedRevision: origin.revision, expectedHash: origin.contentHash, confirmed: true }, spacesView],
      ['document.read', { resourceId }, markdownView],
      ['document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, markdownView],
      ['document.update', { resourceId, epoch: a.state.document.epoch, schemaVersion: SCHEMA_VERSION, updateBase64: 'AAA=' }, markdownView]
    ]
    for (const [key, input, view] of denied) assert.ok([403, 404].includes((await request(key, input, 'outsider', 0, view)).status), key)
  })
  await check('both clients, reopened document and physical project file converge while source remains unchanged', async () => {
    let saved
    await until(async () => { saved = await action('document.read', { resourceId }); return saved.document.status === 'ready' && saved.markdown === content(a) }, 'file publication')
    assert.equal(saved.markdown, content(b)); assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, [])
    const reopened = await action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, 'editor', 1)
    assert.equal(model.read(reopened.stateBase64).markdown, saved.markdown)
    const r = await fetch(`${api}/xpert-project/${f.projectId}/workspace/file?path=${encodeURIComponent(saved.document.path)}`, { headers: headers.owner })
    assert.ok(r.ok); const file = await r.json(); assert.equal(file.contents, saved.markdown)
    finalHash = createHash('sha256').update(file.contents).digest('hex'); assert.equal(finalHash, saved.document.fileHash)
    const fresh = await action('source.preview', { bindingId: origin.bindingId, locator }, 'owner', 0, spacesView)
    assert.equal(fresh.contentHash, snapshot.contentHash); assert.equal(fresh.revision, snapshot.revision)
    assert.deepEqual((await tree()).find(x => x.id === resourceId).importOrigin, origin)
  })
} finally {
  for (const p of peers) { p.client.disconnect(); p.doc.destroy() }
  await writeFile(`${directory}/feishu-import-collaboration-results.json`, JSON.stringify({ resourceId, results, finalHash, completedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
}
