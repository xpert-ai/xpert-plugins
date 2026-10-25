import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ArtifactsRuntimeCapability, type CreateArtifactInput } from '@xpert-ai/plugin-sdk'
import { SpaceArtifacts } from '../src/artifacts.js'
import { SpaceFiles } from '../src/files.js'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user', projectId: 'project' }

function fixture() {
  const inputs: CreateArtifactInput[] = [], scopes: object[] = []
  const access = { resource: async () => ({ space: { projectId: actor.projectId }, item: { title: 'Page' } }),
    items: { update: async () => undefined } }
  const api = { createArtifact: async (input: CreateArtifactInput) => { inputs.push(input); return { id: 'artifact' } },
    ensureArtifactVersion: async () => ({ version: { id: 'version' } }),
    createArtifactLink: async () => ({ publicUrl: '/artifacts/share' }) }
  const runtime = { createScopedApi: (scope: object) => {
    scopes.push(scope)
    return { capabilities: { get: (capability: unknown) => {
      assert.equal(capability, ArtifactsRuntimeCapability)
      return api
    } } }
  } }
  return { access, runtime, inputs, scopes }
}

test('page initialization explicitly requests Project ownership without duplicating source identity', async () => {
  const f = fixture()
  await new SpaceArtifacts(f.access as never, f.runtime as never).initializePage(actor, 'page', 'Page')
  assert.equal(f.inputs[0].source.resourceId, 'page')
  assert.equal(f.inputs[0].authorizationProviderKey, 'spaces')
  assert.deepEqual(f.inputs[0].scope, { projectId: 'project', userId: null })
  assert.ok(!('resourceRef' in f.inputs[0]))
  assert.equal(Reflect.get(f.scopes[0], 'userId'), 'user')
})

test('page export uses the same canonical source and shared owner as initialization', async () => {
  const f = fixture()
  const files = new SpaceFiles(f.access as never,
    { checkpoint: async () => ({ id: 'revision', markdown: '# Page', sequence: 1 }) } as never,
    {} as never, {} as never, {} as never, {} as never, f.runtime as never)
  files.put = async () => ({ id: 'file-version', reference: { originalName: 'page.md' }, sha256: 'hash' }) as never
  await files.exportPage(actor, 'page')
  assert.equal(f.inputs[0].source.resourceId, 'page')
  assert.equal(f.inputs[0].authorizationProviderKey, 'spaces')
  assert.deepEqual(f.inputs[0].scope, { projectId: 'project', userId: null })
  assert.equal(Reflect.get(f.scopes[0], 'userId'), 'user')
})
