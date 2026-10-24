import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ContentDocumentsRuntimeCapability, ProjectFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { SpaceDocuments } from '../src/documents.js'
import { SpaceContent } from '../src/content.js'
import { SpacePages } from '../src/pages.js'
import { Space, SpaceItem } from '../src/entities.js'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'writer', projectId: 'project' }
function fixture() {
  const events: string[] = []
  const item = Object.assign(new SpaceItem(), { id: 'item', title: 'Page', kind: 'page', parentId: null })
  const space = Object.assign(new Space(), { id: 'space', projectId: 'project' })
  const access = { items: { update: async (_id: string, patch: Partial<SpaceItem>) => { Object.assign(item, patch) } },
    resource: async () => ({ item, space }) }
  const state = { document: { id: item.id, projectId: 'project', sequence: 1, epoch: 1 }, markdown: 'head', blocks: [] }
  const contentApi = {
    validateImport: async () => undefined,
    register: async (input: { resourceId: string; source: { resourceId: string }; path: string }) => {
      assert.equal(input.resourceId, item.id); assert.equal(input.source.resourceId, item.id)
      assert.equal(input.path, 'Page.md'); events.push('register')
    }, get: async () => { events.push('get'); return state },
    checkpoint: async () => { events.push('checkpoint'); return { id: 'revision', sequence: 1 } },
    preview: async (input: { revisionId: string }) => {
      assert.equal(input.revisionId, 'revision'); events.push('preview'); return { markdown: 'immutable revision' }
    }
  }
  const runtime = { require: (capability: unknown) => {
    if (capability === ContentDocumentsRuntimeCapability) return contentApi
    assert.equal(capability, ProjectFilesRuntimeCapability)
    return { write: async () => { events.push('write'); return { sha256: 'hash' } } }
  } }
  const documents = new SpaceDocuments(access as never, runtime as never)
  const content = new SpaceContent(access as never, runtime as never)
  return { documents, content, item, space, events, access, contentApi }
}
test('new pages register the platform model after file creation, with no legacy room', async () => {
  const f = fixture()
  await f.documents.initialize(actor, f.space, f.item, Buffer.from('# Page'))
  assert.deepEqual(f.events, ['write', 'register'])
  assert.equal(f.item.editorKey, 'markdown.tiptap')
  await f.content.open(actor, f.item.id)
  assert.deepEqual(f.events, ['write', 'register', 'get'])
})
test('opening an unregistered page cannot silently migrate or write it', async () => {
  const f = fixture(); f.item.filePath = 'Page.md'
  await assert.rejects(f.content.open(actor, f.item.id), /access_denied/)
  assert.deepEqual(f.events, [])
})
test('failed registration never marks the navigation projection ready for the editor', async () => {
  const f = fixture()
  f.contentApi.register = async () => { throw new Error('registration unavailable') }
  await assert.rejects(f.documents.initialize(actor, f.space, f.item, Buffer.from('# Page')), /registration unavailable/)
  assert.notEqual(f.item.editorKey, 'markdown.tiptap')
})
test('export reads the immutable checkpoint instead of a concurrently changing head', async () => {
  const f = fixture()
  const pages = new SpacePages(f.access as never, f.content)
  const revision = await pages.checkpoint(actor, f.item.id, 'Export')
  assert.equal(revision.markdown, 'immutable revision')
  assert.deepEqual(f.events, ['checkpoint', 'preview'])
})
