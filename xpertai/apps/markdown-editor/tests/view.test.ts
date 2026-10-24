import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MarkdownEditorView } from '../src/view.js'
import { SCHEMA_VERSION } from '../src/schema.js'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
const resourceId = 'f0f07e56-501c-4369-81f2-9377d8e5bb86'
const context = { hostType: 'agent', hostId: resourceId, tenantId: resourceId, organizationId: resourceId,
  userId: resourceId, capabilities: { features: ['spaces'] }, runtimeScope: { projectId: resourceId } } as XpertResolvedViewHostContext

test('no Project renders an empty view but cannot open or mutate document data', async () => {
  let calls = 0
  const view = new MarkdownEditorView({ require: () => { calls++; throw Error('must not access documents') } } as never)
  const noProject = { ...context, runtimeScope: { projectId: null } }
  assert.deepEqual(await view.getViewData(noProject, 'markdown.editor', { selectionId: resourceId }),
    { items: [], meta: { requiresProject: true, requiresDocument: true } })
  assert.throws(() => view.scope(noProject), /markdown.project_required/u)
  assert.equal(calls, 0)
})

test('old iframes cannot silently claim the new schema and only explicit current sessions reach the platform', async () => {
  const requests: unknown[] = []
  const api = { get: async () => ({ document: { modelKey: 'markdown.tiptap' } }),
    session: async (input: unknown) => { requests.push(input); return {} } }
  const view = new MarkdownEditorView({ require: () => api } as never)
  for (const input of [{ resourceId }, { resourceId, schemaVersion: 1 }, { resourceId, schemaVersion: 2 }, { resourceId, schemaVersion: 3 }, { resourceId, schemaVersion: SCHEMA_VERSION + 1 }])
    await assert.rejects(() => view.executeViewAction(context, 'markdown.editor', 'document.session', { input }))
  assert.equal(requests.length, 0)
  const result = await view.executeViewAction(context, 'markdown.editor', 'document.session', { input: { resourceId, schemaVersion: SCHEMA_VERSION } })
  assert.equal(result.success, true)
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0], { actor: { tenantId: resourceId, organizationId: resourceId, userId: resourceId },
    assistantId: resourceId, projectId: resourceId, resourceId, schemaVersion: SCHEMA_VERSION })
})

test('file transport is explicit and read-only upload returns a permission error before writing', async () => {
  let writes = 0
  const view = new MarkdownEditorView({ require: () => ({
    get: async () => ({ document: { modelKey: 'markdown.tiptap' }, canWrite: false, externalChange: false }),
    upload: async () => { writes++; return {} }
  }) } as never)
  const manifest = view.getViewManifests(context, 'agent.workbench.main')[0]
  assert.equal(manifest.actions?.find(action => action.key === 'reference.upload')?.transport, 'file')
  assert.ok(manifest.fileAccess?.purposes.includes('preview'))
  await assert.rejects(() => view.executeViewFileAction(context, 'markdown.editor', 'reference.upload',
    { input: { resourceId, kind: 'file' } }, { originalname: 'file.txt', buffer: Buffer.from('data') }),
    (error: unknown) => error instanceof Error && 'getStatus' in error && typeof error.getStatus === 'function' && error.getStatus() === 403)
  assert.equal(writes, 0)
})
