// Runs against an explicitly initialized local organization. Credentials stay in macOS Keychain.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import { io } from 'socket.io-client'
const identity = JSON.parse(readFileSync(process.env.SPACES_TEST_IDENTITY, 'utf8'))
const api = process.env.XPERT_API_URL ?? 'http://localhost:3000/api'
const fixture = JSON.parse(readFileSync(process.env.SPACES_ASSISTANT_FIXTURE, 'utf8'))
const assistantId = fixture.assistants.shared
const viewBase = (id) => `/view-hosts/agent/${id}/views/spaces.views__spaces.workspace`
const base = viewBase(assistantId)
const results = [], sockets = []
async function login(name) {
  const user = name === 'admin' ? { email: identity.adminEmail } : identity.testUsers.find((entry) => entry.name === name)
  const password = execFileSync('security', ['find-generic-password', '-s', name === 'admin' ? 'xpert-local-plugin-password' : 'xpert-spaces-test-password', '-a', user.email, '-w'], { encoding: 'utf8' }).trim()
  const response = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) })
  assert.equal(response.status, 200)
  const auth = await response.json()
  return { authorization: `Bearer ${auth.token}`, 'tenant-id': identity.tenantId, 'organization-id': identity.organizationId }
}
async function request(headers, key, input, expected = 201) {
  const response = await fetch(`${api}${base}/actions/${key}`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ input }) })
  const body = await response.json()
  assert.equal(response.status, expected, `${key}: ${JSON.stringify(body).slice(0, 350)}`)
  return body.data
}
const record = (name) => { results.push({ name, passed: true }); console.log(`PASS ${name}`) }
function document(state) { const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state, 'base64')); return doc }
function append(doc, value) { const vector = Y.encodeStateVector(doc); doc.getArray('blocks').get(0).get('text').insert(0, value); return Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64') }
async function socketSession(headers, itemId) {
  const { session } = await request(headers, 'page.session', { itemId })
  const socket = io(session.connectionUrl, { autoConnect: false, transports: ['websocket'], auth: { sessionId: session.sessionId, clientKey: session.clientKey, documentId: session.documentId } })
  sockets.push(socket)
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('collaboration sync timeout')), 8000); socket.once('sync', () => { clearTimeout(timer); resolve() }); socket.once('connect_error', reject); socket.connect() })
  return socket
}
try {
  const [owner, editor, outsider] = await Promise.all(['owner', 'editor', 'outsider'].map(login))
  const admin = await login('admin')
  async function adminCall(method, path, body) {
    const response = await fetch(`${api}${path}`, { method, headers: { ...admin, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    const result = await response.json(); assert(response.ok, `${method} ${path} ${response.status}`); return result
  }
  const memberIds = (names) => identity.testUsers.filter(u => names.includes(u.name)).map(u => u.userId)
  const members = (names) => adminCall('PUT', `/user-groups/${fixture.groupId}/members`, memberIds(names))
  await members(['owner', 'editor'])
  const getData = async (headers, id) => { const r = await fetch(`${api}${viewBase(id)}/data`, { headers }); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).meta }
  const [workspaceOpened, sharedOpened] = await Promise.all([getData(owner, assistantId), getData(editor, assistantId)])
  const space = workspaceOpened.root; assert.equal(space.id, sharedOpened.root.id)
  const disabled = await fetch(`${api}${viewBase(fixture.assistants.disabled)}/manifest`, { headers: owner }); assert([403,404].includes(disabled.status))
  const outsiderView = await fetch(`${api}${base}/data`, { headers: outsider }); assert.equal(outsiderView.status, 403)
  const personalOwner = await getData(owner, fixture.assistants.personal), personalEditor = await getData(editor, fixture.assistants.personal)
  assert.notEqual(personalOwner.root.id, personalEditor.root.id)
  record('published capability gate, inherited Assistant ACL, shared provisioning and personal isolation')
  const folder = await request(owner, 'item.create', { spaceId: space.id, title: '产品文档', kind: 'folder' })
  const page = await request(owner, 'item.create', { spaceId: space.id, parentId: folder.id, title: '发布计划', kind: 'page' })
  await request(outsider, 'page.read', { itemId: page.id }, 403)
  await request(editor, 'page.read', { itemId: page.id }); record('create nested content under inherited Assistant access; outsider denied')
  const state = await request(owner, 'page.session', { itemId: page.id })
  const left = document(state.state), right = document(state.state)
  const a = append(left, '发布日为周五。'), b = append(right, 'Owner and editor collaborate. ')
  const [ackA, ackB] = await Promise.all([request(owner, 'page.update', { itemId: page.id, updateBase64: a }), request(editor, 'page.update', { itemId: page.id, updateBase64: b })])
  let current = await request(owner, 'page.read', { itemId: page.id })
  assert(current.markdown.includes('发布日为周五。')); assert(current.markdown.includes('Owner and editor collaborate.'))
  assert.equal(current.sequence, 2)
  const duplicate = await request(owner, 'page.update', { itemId: page.id, updateBase64: a }); assert.equal(duplicate.sequenceNumber, 2)
  left.destroy(); right.destroy(); record('two-user CRDT merge and duplicate idempotency')
  const checkpoint = await request(owner, 'page.checkpoint', { itemId: page.id, label: 'Before AI change' })
  const patch = { itemId: page.id, mutationId: randomUUID(), expectedSequence: current.sequence, blockId: current.blocks[0].id, before: current.blocks[0].text, after: '发布日为下周一。Owner and editor collaborate.', reason: '确认后的延期通知' }
  const [proposal, sameProposal] = await Promise.all([request(editor, 'proposal.create', patch), request(editor, 'proposal.create', patch)])
  assert.equal(sameProposal.id, proposal.id)
  const applied = await request(owner, 'proposal.decide', { proposalId: proposal.id, accept: true }); assert.equal(applied.status, 'accepted')
  await request(owner, 'proposal.decide', { proposalId: proposal.id, accept: true })
  current = await request(owner, 'page.read', { itemId: page.id }); assert.equal(current.sequence, 3); assert.equal(current.blocks[0].text, patch.after)
  await request(owner, 'proposal.create', { ...patch, mutationId: randomUUID() }, 409)
  record('reviewed proposal apply, retry and stale-write rejection')
  const comment = await request(editor, 'comment.create', { itemId: page.id, body: '已确认延期', blockId: current.blocks[0].id })
  await request(editor, 'comment.resolve', { commentId: comment.id, resolved: true })
  assert.equal((await request(owner, 'comment.list', { itemId: page.id }))[0].resolved, true)
  await request(owner, 'page.restore', { itemId: page.id, revisionId: checkpoint.id, expectedSequence: current.sequence })
  current = await request(owner, 'page.read', { itemId: page.id }); assert(current.markdown.includes('周五'))
  record('comments and restore as a new revision')
  if (process.env.SPACES_TEST_MODEL === '1') {
    const generated = await request(owner, 'ai.rewrite', { itemId: page.id, blockId: current.blocks[0].id, expectedSequence: current.sequence,
      instruction: '用简洁中文润色，保留发布日为周五的事实，不要改动日期。' })
    assert.equal(generated.status, 'pending')
    assert.equal((await request(owner, 'page.read', { itemId: page.id })).sequence, current.sequence, 'AI must wait for human review')
    await request(owner, 'proposal.decide', { proposalId: generated.id, accept: true })
    current = await request(owner, 'page.read', { itemId: page.id })
    assert(current.markdown.includes('周五'))
    const answer = await request(owner, 'ai.answer', { resourceId: space.id, query: '发布日是哪天？' })
    assert(answer.answer.includes('周五')); assert(answer.citations.some((citation) => citation.itemId === page.id && citation.blockId === current.blocks[0].id))
    record('real model rewrite, human acceptance and grounded question answering')
  }
  const exported = await request(owner, 'page.export', { itemId: page.id })
  assert.equal(exported.sequence, current.sequence)
  const downloaded = await fetch(exported.url, { headers: editor }); assert.equal(downloaded.status, 200); assert((await downloaded.text()).includes('周五'))
  const collected = await request(owner, 'artifact.collect', { spaceId: space.id, artifactId: exported.artifactId, versionId: exported.versionId })
  const opened = await request(editor, 'artifact.open', { itemId: collected.id })
  assert.equal(opened.version.id, exported.versionId)
  const sessionResponse = await fetch(`${api}/ai/workspace-files/view-sessions`, { method: 'POST', headers: { ...editor, 'content-type': 'application/json' },
    body: JSON.stringify({ hostType: 'agent', hostId: assistantId, viewKey: 'spaces.views__spaces.workspace' }) })
  assert(sessionResponse.ok)
  const fileSession = await sessionResponse.json()
  const grantResponse = await fetch(`${api}/ai/workspace-files/view-sessions/${fileSession.sessionId}/grants`, { method: 'POST', headers: { ...editor, 'content-type': 'application/json' },
    body: JSON.stringify({ fileKey: `artifact:${collected.id}`, purpose: 'download' }) })
  assert(grantResponse.ok)
  const fileGrant = await grantResponse.json()
  const target = new URL(fileGrant.url, api)
  assert.equal(target.origin, new URL(api).origin)
  const parts = target.pathname.split('/workspace-files/content/')[1].split('/')
  const fileContentUrl = `${api}/ai/workspace-files/view-sessions/${parts[0]}/grants/${parts[1]}/content/${parts[2]}`
  const collectedBytes = await fetch(fileContentUrl, { headers: editor }); assert.equal(collectedBytes.status, 200); assert((await collectedBytes.text()).includes('周五'))
  record('immutable Artifact export, collection and authorized file-bridge download')
  const form = new FormData(); form.set('input', JSON.stringify({ spaceId: space.id, parentId: folder.id })); form.set('file', new Blob(['Spaces upload test'], { type: 'text/plain' }), 'test.txt')
  const upload = await fetch(`${api}${base}/actions/file.upload/file`, { method: 'POST', headers: owner, body: form }); const file = await upload.json(); assert.equal(upload.status, 201, JSON.stringify(file).slice(0,350)); assert(file.data.version.id)
  await request(editor, 'file.list', { itemId: file.data.item.id }); record('Workspace Files upload and version listing')
  const adapters = await request(owner, 'editor.list', {})
  assert(adapters.some((adapter) => adapter.key === 'office.xlsx'))
  const sheet = await request(owner, 'editor.create', { spaceId: space.id, title: 'Budget', editorKey: 'office.xlsx' })
  const sheetBefore = await request(editor, 'editor.read', { itemId: sheet.id })
  const patchCells = { sheetId: sheetBefore.document.sheets[0].id, cells: [{ row: 0, column: 0, value: 120 }, { row: 0, column: 1, value: '', formula: 'A1*2' }] }
  const sheetAfter = await request(owner, 'editor.save', { itemId: sheet.id, expectedVersionId: sheetBefore.versionId, patch: patchCells })
  await request(editor, 'editor.save', { itemId: sheet.id, expectedVersionId: sheetBefore.versionId, patch: patchCells }, 409)
  const readSheet = await request(editor, 'editor.read', { itemId: sheet.id })
  assert.equal(readSheet.versionId, sheetAfter.versionId); assert(readSheet.document.sheets[0].cells.some((cell) => cell.value === 120))
  assert.equal((await request(owner, 'file.list', { itemId: sheet.id })).length, 2)
  record('XLSX provider, immutable file revisions and concurrent-save conflict')
  await request(owner, 'item.create', { spaceId: space.id, title: 'Invalid', kind: 'artifact' }, 400)
  await request({ ...owner, 'organization-id': randomUUID() }, 'page.read', { itemId: page.id }, 403)
  const forgedHeader = await request({ ...owner, 'tenant-id': randomUUID() }, 'page.read', { itemId: page.id })
  assert.equal(forgedHeader.item.tenantId, identity.tenantId, 'Tenant identity must come from authenticated JWT, not the header')
  record('invalid payload, cross-organization denial and trusted tenant identity')
  const editorSocket = await socketSession(editor, page.id), ownerSocket = await socketSession(owner, page.id)
  let received = 0; editorSocket.on('update', () => received++)
  await members(['owner'])
  const latest = await request(owner, 'page.session', { itemId: page.id }); const doc = document(latest.state)
  const disconnected = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('revoked socket remained connected')), 8000); editorSocket.once('disconnect', () => { clearTimeout(timer); resolve() }) })
  await request(owner, 'page.update', { itemId: page.id, updateBase64: append(doc, '撤权后的保密内容。') }); doc.destroy(); await disconnected; assert.equal(received, 0)
  await request(editor, 'page.read', { itemId: page.id }, 403)
  await request(editor, 'page.session', { itemId: page.id }, 403)
  await request(editor, 'file.list', { itemId: file.data.item.id }, 403)
  await request(editor, 'artifact.open', { itemId: collected.id }, 403)
  await request(editor, 'editor.read', { itemId: sheet.id }, 403)
  await request(editor, 'search', { resourceId: space.id, query: '发布' }, 403)
  const revokedDownload = await fetch(exported.url, { headers: editor }); assert([401,403,404].includes(revokedDownload.status), `revoked export ${revokedDownload.status}`)
  const oldFileGrant = await fetch(fileContentUrl, { headers: editor }); assert([401,403,404].includes(oldFileGrant.status))
  const fixedExport = await fetch(exported.url, { headers: owner }); assert.equal(fixedExport.status, 200); assert(!(await fixedExport.text()).includes('撤权后的保密内容'))
  record('revocation blocks reads, sessions, files, search, exports and open WebSocket')
  await request(owner, 'item.edit', { itemId: folder.id, expectedVersion: folder.version, deleted: true })
  await request(owner, 'page.read', { itemId: page.id }, 403)
  await request(owner, 'item.edit', { itemId: folder.id, expectedVersion: folder.version + 1, deleted: false })
  await request(owner, 'page.read', { itemId: page.id }); record('trash inheritance and restore')
  await members(['owner', 'editor', 'outsider'])
  await request(outsider, 'page.read', { itemId: page.id })
  await request(outsider, 'page.checkpoint', { itemId: page.id, label: 'Assistant group member' })
  await members(['owner', 'editor'])
  await request(outsider, 'page.read', { itemId: page.id }, 403)
  record('Assistant group addition and immediate removal')
  for (const id of [fixture.assistants.other, fixture.assistants.personal]) {
    const response = await fetch(`${api}${viewBase(id)}/actions/page.read`, { method: 'POST', headers: { ...owner, 'content-type': 'application/json' }, body: JSON.stringify({ input: { itemId: page.id } }) })
    assert.equal(response.status, 403)
  }
  record('cross-Assistant document ids rejected even for an authorized human')
  const original = await adminCall('GET', `/xpert/${assistantId}/team`)
  const baselineDraft = { team: original, nodes: original.graph.nodes, connections: original.graph.connections }
  const disabledDraft = structuredClone(baselineDraft)
  const removed = new Set(disabledDraft.nodes.filter(n => n.type === 'workflow' && n.entity.provider === 'spaces').map(n => n.key))
  disabledDraft.nodes = disabledDraft.nodes.filter(n => !removed.has(n.key))
  disabledDraft.connections = disabledDraft.connections.filter(c => !removed.has(c.to))
  try {
    await adminCall('POST', `/xpert/${assistantId}/draft`, disabledDraft)
    await adminCall('POST', `/xpert/${assistantId}/publish?newVersion=false`, { environmentId: null, releaseNotes: 'Capability removal test' })
    const removedView = await fetch(`${api}${base}/data`, { headers: owner }); assert([403,404].includes(removedView.status))
    const removedExport = await fetch(exported.url, { headers: owner }); assert([401,403,404].includes(removedExport.status))
    record('published capability removal invalidates the old view and Artifact download')
  } finally {
    await adminCall('POST', `/xpert/${assistantId}/draft`, baselineDraft)
    await adminCall('POST', `/xpert/${assistantId}/publish?newVersion=false`, { environmentId: null, releaseNotes: 'Restore collaboration capability' })
  }
  assert.equal((await getData(owner, assistantId)).root.id, space.id)
  await request(owner, 'page.read', { itemId: page.id })
  record('republishing retains the Assistant workspace and saved content')
  if (process.env.SPACES_TEST_REPORT) writeFileSync(process.env.SPACES_TEST_REPORT, JSON.stringify({ completedAt: new Date().toISOString(), assistantId, spaceId: space.id, pageId: page.id, results }, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ passed: results.length, spaceId: space.id, pageId: page.id }))
} finally { sockets.forEach((socket) => socket.disconnect()) }
