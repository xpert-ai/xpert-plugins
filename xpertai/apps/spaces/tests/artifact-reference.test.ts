import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ArtifactLibraryRuntimeCapability, DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { SpaceArtifactLibrary } from '../src/artifact-library.js'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user', projectId: 'project', assistantId: 'assistant' }

test('reference collection validates destination, preserves trusted scope and registers a catalog placement', async () => {
  const seen: object[] = [], placements: object[] = []
  const runtime = new DefaultRuntimeCapabilityRegistry().register(ArtifactLibraryRuntimeCapability, {
    add: async input => { seen.push(input); return { referenceId: 'reference', contentId: 'content' } },
    open: async () => { throw Error('unused') }, selectVersion: async () => {}, share: async () => { throw Error('unused') }, revoke: async () => {}
  })
  const destination = { space: { id: 'space' }, item: { kind: 'folder' } }
  const library = new SpaceArtifactLibrary(runtime,
    { project: async () => {}, resource: async () => destination } as never,
    { attach: async (...input: object[]) => { placements.push(input) } } as never)
  const input = { spaceId: 'space', parentId: 'folder', artifactId: 'artifact', versionId: 'version' }
  assert.deepEqual(await library.add(actor, input), { referenceId: 'reference', contentId: 'content' })
  assert.deepEqual(seen, [{ actor, projectId: 'project', assistantId: 'assistant', artifactId: 'artifact', versionId: 'version' }])
  assert.deepEqual(placements, [[actor, 'content', 'folder']])
  destination.item.kind = 'page'
  await assert.rejects(library.add(actor, input))
  await assert.rejects(library.open({ ...actor, projectId: undefined }, 'reference'))
  assert.equal(seen.length, 1)
})
