import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { randomUUID, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import * as Y from 'yjs'
import { SCHEMA_VERSION } from '../dist/schema.js'
const directory = process.env.SPACES_TEST_DIRECTORY
if (!directory) throw new Error('Set SPACES_TEST_DIRECTORY to the private local acceptance fixture')
const { login, api } = await import(pathToFileURL(`${directory}/probe.mjs`))
const fixture = JSON.parse(await readFile(`${directory}/editor-acceptance-fixture.json`, 'utf8'))
const headers = Object.fromEntries(await Promise.all(['owner', 'editor', 'outsider'].map(async (user) => [user, {
  ...await login(user), 'content-type': 'application/json', 'x-xpert-view-project-id': fixture.projectId
}])))
const view = 'markdown.views__markdown.editor', spaces = 'spaces.views__spaces.workspace'
async function request(key, input, user = 'owner', selected = view, assistant = 0) {
  const response = await fetch(`${api}/view-hosts/agent/${fixture.assistantIds[assistant]}/views/${selected}/actions/${key}`, {
    method: 'POST', headers: headers[user], body: JSON.stringify({ input }), signal: AbortSignal.timeout(30000)
  })
  return { status: response.status, body: await response.json() }
}
async function action(...args) { const r = await request(...args); assert.ok(r.status < 300 && r.body.success, `${args[0]}: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`); return r.body.data }
const results = []
async function check(name, work) { await work(); results.push(name); console.log(`PASS ${name}`) }
let parent, child, grandchild
await check('import inline/display math without changing the original project file', async () => {
  parent = await action('item.create', { spaceId: fixture.spaceId, kind: 'page', title: `公式与子页面验收 ${Date.now()}`,
    content: '# 公式与子页面验收\n\n在这里整理团队的数学模型与推导。\n\n$$\n\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$\n\n面积公式 $S=\\pi r^2$。' }, 'owner', spaces)
  const state = await action('document.open', { itemId: parent.id }, 'owner', spaces)
  assert.equal(state.document.fileHash, parent.fileHash); assert.equal(state.document.schemaVersion, SCHEMA_VERSION)
  assert.ok(state.blocks.some((block) => block.type === 'blockMath'))
})
await check('concurrent retry creates exactly one independently registered child', async () => {
  const input = { resourceId: parent.id, title: '推导与假设', requestId: randomUUID() }
  const children = await Promise.all([action('document.createChild', input), action('document.createChild', input)])
  child = children[0]; assert.equal(child.id, children[1].id)
  const tree = await action('document.hierarchy', { resourceId: parent.id })
  assert.equal(tree.children.length, 1); assert.equal(tree.children[0].resourceId, child.id)
  assert.equal(child.projectId, fixture.projectId); assert.notEqual(child.path, parent.filePath)
})
await check('multiple Assistants share the hierarchy; outsiders cannot read or create', async () => {
  grandchild = await action('document.createChild', { resourceId: child.id, title: '符号说明', requestId: randomUUID() }, 'editor', view, 1)
  const tree = await action('document.hierarchy', { resourceId: child.id })
  assert.equal(tree.parent.resourceId, parent.id); assert.equal(tree.children[0].resourceId, grandchild.id)
  for (const key of ['document.hierarchy', 'document.createChild']) {
    const r = await request(key, { resourceId: parent.id, title: '不得创建', requestId: randomUUID() }, 'outsider')
    assert.ok([403, 404].includes(r.status))
  }
})
await check('parent rename and trash/restore retain the child file and logical relationship', async () => {
  parent = await action('item.edit', { itemId: parent.id, expectedVersion: parent.version, title: `${parent.title}（已验证）` }, 'owner', spaces)
  assert.equal((await action('document.hierarchy', { resourceId: child.id })).parent.title, parent.title)
  const before = await action('document.read', { resourceId: child.id })
  parent = await action('item.edit', { itemId: parent.id, expectedVersion: parent.version, deleted: true }, 'owner', spaces)
  assert.equal((await action('document.hierarchy', { resourceId: child.id })).parent, null)
  assert.equal((await action('document.read', { resourceId: child.id })).document.fileHash, before.document.fileHash)
  parent = await action('item.edit', { itemId: parent.id, expectedVersion: parent.version, deleted: false }, 'owner', spaces)
  assert.equal((await action('document.hierarchy', { resourceId: child.id })).parent.resourceId, parent.id)
})
await check('formula CRDT edit materializes and matches actual Markdown file bytes', async () => {
  const state = await action('document.session', { resourceId: parent.id, schemaVersion: SCHEMA_VERSION })
  const doc = new Y.Doc(); Y.applyUpdate(doc, Buffer.from(state.stateBase64, 'base64'))
  const vector = Y.encodeStateVector(doc), block = doc.getXmlFragment('body').toArray().find((node) => node instanceof Y.XmlElement && node.nodeName === 'blockMath')
  assert.ok(block); block.setAttribute('latex', '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}')
  await action('document.update', { resourceId: parent.id, epoch: state.document.epoch, schemaVersion: SCHEMA_VERSION,
    updateBase64: Buffer.from(Y.encodeStateAsUpdate(doc, vector)).toString('base64') }); doc.destroy()
  let saved
  const deadline = Date.now() + 20000
  do { saved = await action('document.read', { resourceId: parent.id }); if (saved.document.status === 'ready' && saved.markdown.includes('sum_')) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  } while (Date.now() < deadline)
  assert.match(saved.markdown, /sum_/u); assert.equal(saved.document.status, 'ready')
  const response = await fetch(`${api}/xpert-project/${fixture.projectId}/workspace/file?path=${encodeURIComponent(saved.document.path)}`, { headers: headers.owner })
  assert.ok(response.ok); const file = await response.json()
  assert.equal(createHash('sha256').update(file.contents).digest('hex'), saved.document.fileHash)
})
await writeFile(`${directory}/math-subpages-fixture.json`, JSON.stringify({ projectId: fixture.projectId, assistantIds: fixture.assistantIds, parent, child, grandchild, results }, null, 2))
console.log(`Verified ${results.length} live scenarios; fixture saved privately.`)
