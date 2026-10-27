import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SpaceItem } from '../src/entities.js'
import { assertFolderHasNoResources } from '../src/resource-folders.js'
import { SpacesResourceProvider } from '../src/resource-provider.js'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
const folder = Object.assign(new SpaceItem(), { id: 'folder', spaceId: 'space', kind: 'folder', filePath: 'folder', version: 1 })
function manager(parentId: string | null) {
  return { getRepository: (type: object) => ({ findBy: async () => type === SpaceItem
    ? [folder, { id: 'nested', parentId: folder.id }]
    : [{ contentId: 'deck', parentId }] }) }
}
test('folder deletion checks resources in nested folders without treating native source paths as placement', async () => {
  await assert.rejects(assertFolderHasNoResources(manager('nested') as never, actor, folder), /folder_contains_resources/)
  await assertFolderHasNoResources(manager(null) as never, actor, folder)
})
test('Markdown folder relocation refuses resource-containing deletion before retiring rooms', async () => {
  const access = { items: { manager: manager('nested') }, resource: async () => ({ item: folder, space: { id: 'space', projectId: 'project' } }) }
  const provider = new SpacesResourceProvider(access as never, {} as never, {} as never, {} as never, {} as never, {} as never)
  await assert.rejects(provider.validateLocationChange({ actor, projectId: 'project', source: { providerKey: 'spaces', resourceId: folder.id },
    path: 'folder', destination: '.space-trash/folder', expectedSourceVersion: 1, title: 'Folder', parentResourceId: null, deleted: true }), /folder_contains_resources/)
})
