import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ForbiddenException } from '@nestjs/common'
import { SpaceContentKnowledge } from '../src/content-knowledge.js'
const docId = '10000000-0000-4000-8000-000000000001'
test('knowledge matches reject stale source, changed binding and revoked access before exposing text', async () => {
  const item = { contentId: 'content', title: 'Title', revision: '2', bindingRevision: 1, deleted: false }
  let denied = false
  const service = new SpaceContentKnowledge({ findBy: async () => [{ contentId: 'content', revision: '2', bindingRevision: 1, documents: [{ id: docId, anchor: { kind: 'slide', id: 'slide' } }] }] } as never,
    { require: () => ({ catalog: { get: async () => { if (denied) throw new ForbiddenException(); return item } } }) } as never)
  const actor = { tenantId: 't', organizationId: 'o', userId: 'u' }, space = { id: 'space', projectId: 'project' } as never
  const hits = [{ metadata: { documentId: docId }, pageContent: 'Secret text' }]
  assert.equal((await service.matches(actor, space, hits))[0].anchor.id, 'slide')
  item.revision = '3'; assert.deepEqual(await service.matches(actor, space, hits), [])
  item.revision = '2'; item.bindingRevision = 2; assert.deepEqual(await service.matches(actor, space, hits), [])
  item.bindingRevision = 1; denied = true; assert.deepEqual(await service.matches(actor, space, hits), [])
})
