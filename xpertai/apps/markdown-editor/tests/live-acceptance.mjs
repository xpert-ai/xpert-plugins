import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import * as Y from 'yjs'
import { SCHEMA_VERSION } from '../dist/schema.js'

// Credentials remain in the private local fixture's normal login helper, never in evidence.
const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw new Error('Set SPACES_TEST_DIRECTORY to the private deployment fixture directory')
const { login, api } = await import(pathToFileURL(`${directory}/probe.mjs`))
const fixture = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
let resourceId = fixture.item.id
const projectId = fixture.projectId
const results = []
const headers = Object.fromEntries(await Promise.all(['owner', 'editor', 'outsider'].map(async (name) => [name, {
  ...await login(name), 'content-type': 'application/json', 'x-xpert-view-project-id': projectId
}])))
async function request(user, path, body) {
  const response = await fetch(api + path, { method: 'POST', headers: headers[user], body: JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}
async function action(key, input = {}, user = 'owner', assistant = 0, view = 'markdown.views__markdown.editor') {
  const result = await request(user, `/view-hosts/agent/${fixture.assistantIds[assistant]}/views/${view}/actions/${key}`, { input })
  assert.ok(result.status < 300, `${key}: ${result.status} ${JSON.stringify(result.data).slice(0, 400)}`)
  assert.equal(result.data.success, true)
  return result.data.data
}
async function review(operation, input = {}, user = 'owner', assistant = 0) {
  const result = await request(user, `/ai/assistants/${fixture.assistantIds[assistant]}/projects/${projectId}/content/${resourceId}/${operation}`, input)
  assert.ok(result.status < 300, `${operation}: ${result.status} ${JSON.stringify(result.data).slice(0, 400)}`)
  return result.data
}
async function check(name, work) { await work(); results.push({ name, passed: true }); console.log(`PASS ${name}`) }
function change(state, index, suffix) {
  const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state.stateBase64, 'base64'))
  const vector = Y.encodeStateVector(doc), element = doc.getXmlFragment('body').get(index)
  assert.ok(element instanceof Y.XmlElement)
  const text = element.get(0); assert.ok(text instanceof Y.XmlText)
  text.insert(text.length, suffix)
  const updateBase64 = Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64'); doc.destroy()
  return { resourceId, epoch: state.document.epoch, schemaVersion: state.document.schemaVersion, updateBase64 }
}
let state, originalRevision, oldEpoch
try {
  const item = await action('item.create', { spaceId: fixture.spaceId, title: `编辑器闭环验收 ${Date.now()}`,
    kind: 'page', content: '# 协作验收\n\n初始段落 A。\n\n初始段落 B。' }, 'owner', 0, 'spaces.views__spaces.workspace')
  fixture.item = item; resourceId = item.id
  await writeFile(`${directory}/editor-acceptance-fixture.json`, JSON.stringify(fixture, null, 2))
  await check('migrate legacy page and retain stable identity / original file revision', async () => {
    state = await action('document.open', { itemId: resourceId }, 'owner', 0, 'spaces.views__spaces.workspace')
    assert.equal(state.document.id, resourceId); assert.equal(state.document.modelKey, 'markdown.tiptap')
    assert.equal(state.document.fileHash, fixture.item.fileHash)
    originalRevision = state.document.headRevisionId
  })
  await check('two users and two Assistants share the same room', async () => {
    const [a, b] = await Promise.all([action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }), action('document.session', { resourceId, schemaVersion: SCHEMA_VERSION }, 'editor', 1)])
    assert.equal(a.session.documentId, b.session.documentId); assert.equal(a.session.access, 'write'); assert.equal(b.session.access, 'write')
    assert.notEqual(a.session.actor.presenceId, b.session.actor.presenceId)
  })
  await check('concurrent deltas merge and retries preserve one version', async () => {
    const first = change(state, 1, ' 用户一并发编辑。'), second = change(state, 2, ' 用户二并发编辑。')
    const [a, b] = await Promise.all([action('document.update', first), action('document.update', second, 'editor', 1)])
    // Concurrent accepted updates can share one publication. An acknowledgement may be pending
    // until the publication worker catches up; never equate acceptance with file persistence.
    assert.ok(['pending', 'ready'].includes(a.materializationStatus)); assert.ok(['pending', 'ready'].includes(b.materializationStatus))
    const retry = await action('document.update', first); assert.equal(retry.duplicate, true)
    const deadline = Date.now() + 30000
    do {
      state = await action('document.read', { resourceId })
      if (state.document.status === 'ready' && state.document.sequence === 2) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    } while (Date.now() < deadline)
    assert.match(state.markdown, /用户一并发编辑/); assert.match(state.markdown, /用户二并发编辑/)
    assert.equal(state.document.status, 'ready'); assert.equal(state.document.sequence, 2)
  })
  await check('Assistant comments and history are shared across entry Assistants', async () => {
    const comment = await review('comment', { body: '架构验收：共享评论', blockId: state.blocks[1].id })
    const other = await review('review', {}, 'editor', 1); assert.ok(other.comments.some((entry) => entry.id === comment.id))
    await review('resolve-comment', { commentId: comment.id, resolved: true }, 'editor', 1)
    const preview = await review('preview', { revisionId: originalRevision }); assert.doesNotMatch(preview.markdown, /并发编辑/)
  })
  await check('outsider cannot read, open sessions, comment or inspect history', async () => {
    for (const operation of ['read', 'review', 'comment', 'restore']) {
      const body = operation === 'comment' ? { body: 'unauthorized' } : operation === 'restore' ? {
        revisionId: originalRevision, epoch: state.document.epoch, expectedSequence: state.document.sequence } : {}
      const result = await request('outsider', `/ai/assistants/${fixture.assistantIds[0]}/projects/${projectId}/content/${resourceId}/${operation}`, body)
      assert.ok([403, 404].includes(result.status), `${operation}: ${result.status}`)
    }
  })
  await check('restore advances epoch and rejects old-client updates', async () => {
    const stale = change(state, 1, ' 旧窗口禁止覆盖。'); oldEpoch = state.document.epoch
    await review('restore', { revisionId: originalRevision, epoch: oldEpoch, expectedSequence: state.document.sequence })
    state = await action('document.read', { resourceId }); assert.equal(state.document.epoch, oldEpoch + 1); assert.doesNotMatch(state.markdown, /并发编辑/)
    const result = await request('editor', `/view-hosts/agent/${fixture.assistantIds[1]}/views/markdown.views__markdown.editor/actions/document.update`, { input: stale })
    assert.ok([403,404,409].includes(result.status)); assert.ok((await review('review')).revisions.length >= 3)
  })
} finally {
  await writeFile(`${directory}/editor-live-acceptance.json`, JSON.stringify({ resourceId, projectId, results, head: state?.document }, null, 2))
}
