import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { getMetadataArgsStorage } from 'typeorm'
import {
  AssistantMiddlewareAccessRuntimeCapability, ContentResourcesRuntimeCapability,
  ProjectAccessRuntimeCapability, WorkspaceFilesRuntimeCapability,
  type WorkspaceFileScope, type WorkspaceUploadBufferInput, type AssistantMiddlewareAccessApi
} from '@xpert-ai/plugin-sdk'
import { SpaceAccess } from '../src/access.js'
import { SpaceFiles } from '../src/files.js'
import { SpacesResourceProvider } from '../src/resource-provider.js'
import { Space, SpaceFileVersion, SpaceItem } from '../src/entities.js'

function fixture() {
  const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID(), projectId: randomUUID(), assistantId: randomUUID() }
  const space = Object.assign(new Space(), { id: randomUUID(), ...actor, deleted: false })
  const item = Object.assign(new SpaceItem(), { id: randomUUID(), spaceId: space.id, parentId: null, kind: 'file', deleted: false })
  let role = 'editor', revoked = false, bound = true, assistantChecks = 0
  const scopes: WorkspaceFileScope[] = [], uploads: WorkspaceUploadBufferInput[] = [], current: Buffer[] = []
  const matches = (row: Space | SpaceItem, where: object) => Object.entries(where).every(([key, value]) => Reflect.get(row, key) === value)
  Object.assign(item, { tenantId: actor.tenantId, organizationId: actor.organizationId })
  const items = { findOneBy: async (where: object) => matches(item, where) ? item : null, update: async () => undefined }
  const project = { projectId: actor.projectId, applicationKey: 'platform', projectTypeKey: 'space', role, archived: false, canManage: false }
  const access = new SpaceAccess({ findOneBy: async (where: object) => matches(space, where) ? space : null } as never, items as never, {
    require: (capability: unknown) => {
      if (capability === ContentResourcesRuntimeCapability) return { identities: { principal: async () => actor } }
      if (capability === AssistantMiddlewareAccessRuntimeCapability) return { assertAccess: async (input: Parameters<AssistantMiddlewareAccessApi['assertAccess']>[0]) => {
        assert.deepEqual(input.scope, input.actor === actor ? { type: 'project', projectId: actor.projectId } : { type: 'assistant' });
        assert.equal(input.provider, 'spaces'); assert.equal(input.requiredFeature, 'spaces'); assistantChecks++
      } }
      assert.equal(capability, ProjectAccessRuntimeCapability)
      return {
        assertAssistant: async () => {
          if (revoked || !bound) throw new Error('project denied')
          return { ...project, role }
        },
        listReadable: async () => revoked ? [] : [{ ...project, role }],
        assertEdit: async () => { if (revoked || role === 'member') throw new Error('project denied') },
        assertManage: async () => { throw new Error('project denied') }
      }
    }
  } as never)
  const files = new SpaceFiles(access, {} as never, {} as never, {
    write: async (_actor: object, id: string, buffer: Buffer) => { assert.equal(id, item.id); current.push(buffer) }
  } as never, { sync: async () => undefined } as never, {
    create: (value: object) => Object.assign(new SpaceFileVersion(), value), save: async (value: SpaceFileVersion) => value
  } as never, {
    createScopedApi: (scope: WorkspaceFileScope) => {
      scopes.push(scope)
      return { capabilities: { get: (capability: unknown) => {
        assert.equal(capability, WorkspaceFilesRuntimeCapability)
        return { uploadBuffer: async (input: WorkspaceUploadBufferInput) => {
          uploads.push(input); return { filePath: `${input.folder}/${input.fileName}` }
        } }
      } } }
    }
  } as never)
  return { actor, space, item, access, files, scopes, uploads, current,
    reader: () => { role = 'member' }, revoke: () => { revoked = true }, unbind: () => { bound = false },
    assistantChecks: () => assistantChecks, setProjectType: (type: string) => { project.projectTypeKey = type } }
}

test('Space requires Project binding in its persistence schema', () => {
  const columns = getMetadataArgsStorage().columns.filter(column => column.target === Space)
  assert.equal(columns.find(column => column.propertyName === 'projectId')?.options.nullable ?? false, false)
  assert.ok(!columns.some(column => ['assistantId', 'scopeUserId', 'migratedFromId'].includes(column.propertyName)))
})

test('current files and distinct version snapshots use one Project scope', async () => {
  const f = fixture(), bytes = Buffer.from('shared project content')
  const first = await f.files.put(f.actor, f.item.id, bytes, 'report.md', 'text/markdown')
  const second = await f.files.put(f.actor, f.item.id, bytes, 'report.md', 'text/markdown')
  for (const reference of [first.reference, second.reference, ...f.scopes]) {
    assert.equal(reference.catalog, 'projects')
    assert.equal(reference.projectId, f.actor.projectId)
    assert.equal(reference.scopeId, f.actor.projectId)
    assert.ok(!('spaceId' in reference))
  }
  assert.notEqual(first.reference.filePath, second.reference.filePath)
  assert.match(first.reference.filePath, /^\.space-history\//)
  assert.deepEqual(f.current, [bytes, bytes])
})

test('Project binding cannot fall back to Assistant authority or an independent Space volume', async () => {
  const f = fixture()
  Object.assign(f.space, { projectId: null })
  await assert.rejects(f.files.put(f.actor, f.item.id, Buffer.from('blocked'), 'file.md', 'text/markdown'))
  assert.equal(f.assistantChecks(), 0)
  assert.equal(f.scopes.length, 0)
})

test('resource authorization uses item identity and only accepts its actual Project file path', async () => {
  const f = fixture()
  f.item.filePath = 'docs/report.md'
  const provider = new SpacesResourceProvider(f.access, {} as never, {} as never, {} as never, {} as never, {} as never)
  const input = { providerKey: 'spaces', resourceId: f.item.id, operation: 'read' as const,
    actor: f.actor, principal: { ...f.actor, groupIds: [] }, filePath: f.item.filePath }
  assert.equal((await provider.authorize(input)).resourceId, f.item.id)
  await assert.rejects(provider.authorize({ ...input, filePath: 'docs/another.md' }))
  await assert.rejects(provider.authorize({ ...input, resourceId: f.space.id,
    filePath: `items/${f.item.id}/versions/${randomUUID()}/report.md` }))
})

test('cross-project, read-only, revoked membership and unbound Assistant cannot write snapshots', async () => {
  for (const deny of [(f: ReturnType<typeof fixture>) => { f.actor.projectId = randomUUID() },
    (f: ReturnType<typeof fixture>) => f.reader(), (f: ReturnType<typeof fixture>) => f.revoke(),
    (f: ReturnType<typeof fixture>) => f.unbind()]) {
    const f = fixture(); deny(f)
    await assert.rejects(f.files.put(f.actor, f.item.id, Buffer.from('blocked'), 'file.md', 'text/markdown'))
    assert.equal(f.uploads.length, 0)
    assert.equal(f.current.length, 0)
  }
})


test('capability entry chooses trusted scope; resource checks do not repeat middleware authorization', async () => {
  const f = fixture()
  await f.access.assistant(f.actor)
  assert.equal(f.assistantChecks(), 1)
  for (let i = 0; i < 3; i++) await f.access.resource(f.actor, f.item.id, 'read')
  assert.equal(f.assistantChecks(), 1)
  await f.access.assistant({ ...f.actor, projectId: undefined })
  assert.equal(f.assistantChecks(), 2)
})

// The recovery UI must never weaken the resource policy.
test('General Projects are rejected even after the host authorizes membership and Assistant binding', async () => {
  const f = fixture()
  f.setProjectType('general')
  await assert.rejects(f.access.project(f.actor), /spaces.access_denied/)
  f.setProjectType('space')
  assert.equal((await f.access.project(f.actor)).projectTypeKey, 'space')
})
