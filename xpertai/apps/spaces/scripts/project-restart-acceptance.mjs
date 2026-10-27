// Run after restarting the same isolated deployment used by project-live-acceptance.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const identity = JSON.parse(readFileSync(process.env.SPACES_TEST_IDENTITY, 'utf8'))
const fixture = JSON.parse(readFileSync(process.env.SPACES_PROJECT_FIXTURE, 'utf8'))
const baseline = JSON.parse(readFileSync(process.env.SPACES_TEST_REPORT, 'utf8'))
const api = process.env.XPERT_API_URL ?? 'http://localhost:3000/api'
const user = identity.testUsers.find(u => u.name === 'owner')
const password = execFileSync('security', ['find-generic-password', '-s', 'xpert-spaces-test-password', '-a', user.email, '-w'], { encoding: 'utf8' }).trim()
const authResponse = await fetch(`${api}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: user.email, password }) })
assert.equal(authResponse.status, 200)
const headers = { authorization: `Bearer ${(await authResponse.json()).token}`, 'tenant-id': identity.tenantId,
  'organization-id': identity.organizationId, 'x-xpert-view-project-id': fixture.projectId, 'content-type': 'application/json' }
const host = `/view-hosts/agent/${fixture.assistantIds[0]}/views/spaces.views__spaces.workspace`
async function request(path, body) {
  const response = await fetch(api + path, { headers, method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined })
  assert(response.ok, `${path}: ${response.status}`)
  return response.json()
}
const action = async (key, input) => (await request(`${host}/actions/${key}`, { input })).data
const tree = (await request(`${host}/data`)).meta
assert.equal(tree.root.id, baseline.spaceId)
const page = await action('page.read', { itemId: baseline.pageId })
assert.equal(page.sequence, baseline.sequence)
assert.equal(page.markdown, baseline.markdown)
assert.equal(page.externalChange, false)
const file = await request(`/xpert-project/${fixture.projectId}/workspace/file?path=${encodeURIComponent(baseline.filePath)}`)
assert.equal(file.contents, baseline.markdown)
assert.equal(createHash('sha256').update(file.contents).digest('hex'), page.item.fileHash)
const history = await action('page.history', { itemId: baseline.pageId })
const comments = await action('comment.list', { itemId: baseline.pageId })
const versions = await action('file.list', { itemId: baseline.pageId })
assert(history.length >= 2); assert(comments.length > 0); assert(versions.length > 0)
const knowledge = await action('knowledge.status', { spaceId: baseline.spaceId })
assert.equal(knowledge.knowledgebaseId, baseline.knowledgebaseId)
const migrated = tree.items.filter(i => i.filePath?.startsWith('迁移-') && i.kind === 'page')
assert(migrated.length > 0)
for (const item of migrated) {
  const imported = await action('page.read', { itemId: item.id })
  const content = await request(`/xpert-project/${fixture.projectId}/workspace/file?path=${encodeURIComponent(item.filePath)}`)
  assert.equal(content.contents, imported.markdown)
}
const result = { completedAt: new Date().toISOString(), passed: true, checks: [
  'same Project Space after plugin refresh and API restart', 'CRDT sequence and Markdown unchanged',
  'Project file bytes and SHA-256 match', 'history, comments and immutable file versions retained',
  'built-in knowledge binding retained', 'migrated page CRDT and Project files agree'
], migratedPages: migrated.length }
if (process.env.SPACES_RESTART_REPORT) writeFileSync(process.env.SPACES_RESTART_REPORT, JSON.stringify(result, null, 2), { mode: 0o600 })
console.log(JSON.stringify(result))
