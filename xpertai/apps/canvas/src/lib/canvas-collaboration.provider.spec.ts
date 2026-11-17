jest.mock('./canvas-snapshot.validation.js', () => ({ sanitizeCanvasSnapshot: (snapshot: object) => ({ snapshot, skippedRecords: [] }) }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
  pluginArtifactTableName: (namespace: string, key: string) => `plugin_${namespace}_${key}`,
  CollaborationDocumentProvider: () => <T extends object>(target: T) => target
}))
jest.mock('./canvas.service.js', () => ({ CanvasService: class CanvasService {} }))

import { CanvasCollaborationProvider } from './canvas-collaboration.provider.js'
import type { CanvasService } from './canvas.service.js'
import type { CollaborationMaterializationEvent, CollaborationProviderContext } from '@xpert-ai/plugin-sdk'

describe('CanvasCollaborationProvider', () => {
  it('delegates authorization, initialization, and materialization to CanvasService', async () => {
    const service = {
      authorizeCollaborationDocument: jest.fn(async () => true),
      initializeCollaborationDocument: jest.fn(async () => ({ stateBase64: 'AA==', schemaVersion: 1, initialSequence: 3 })),
      materializeCollaborationDocument: jest.fn(async () => undefined)
    } as unknown as CanvasService
    const provider = new CanvasCollaborationProvider(service)
    const context = {
      tenantId: 'tenant-1', organizationId: 'org-1', providerKey: 'canvas.document', resourceId: 'doc-1', operation: 'write'
    } satisfies CollaborationProviderContext
    const event = {
      ...context,
      operation: 'materialize',
      documentId: 'collab-1',
      stateBase64: 'AA==',
      stateVectorBase64: 'AA==',
      sequenceNumber: 4
    } satisfies CollaborationMaterializationEvent

    await expect(provider.authorize(context)).resolves.toBe(true)
    await expect(provider.initializeDocument(context)).resolves.toEqual(expect.objectContaining({ schemaVersion: 1, initialSequence: 3 }))
    await provider.materializeDocument(event)

    expect(service.materializeCollaborationDocument).toHaveBeenCalledWith(event)
  })
})

it('migrates legacy records and Agent idempotency markers without changing the source state', () => {
  const legacy = new Y.Doc()
  legacy.getMap('canvas').set('schemaVersion', 1)
  writeCanvasSnapshotToYDoc(legacy, { schema: {}, store: { 'page:1': { id: 'page:1', typeName: 'page', name: 'Plan' } } })
  legacy.getMap('operations').set('old-stage', { operationId: 'old-stage', digest: 'preserved' })
  const original = encodeCanvasYDoc(legacy).stateBase64
  const provider = new CanvasCollaborationProvider({} as CanvasService)
  const upgraded = provider.migrateDocument({ providerKey: 'canvas.document', resourceId: 'own-fixture',
    operation: 'manage', stateBase64: original, schemaVersion: 1, targetSchemaVersion: 2 })
  const next = decodeCanvasYDoc(upgraded.stateBase64)
  expect(upgraded.schemaVersion).toBe(2)
  expect(materializeCanvasYDoc(next)).toEqual(materializeCanvasYDoc(legacy))
  expect(next.getMap('operations').get('old-stage')).toEqual({ operationId: 'old-stage', digest: 'preserved' })
  expect(encodeCanvasYDoc(legacy).stateBase64).toBe(original)
  expect(() => provider.migrateDocument({ providerKey: 'canvas.document', resourceId: 'own-fixture', operation: 'manage',
    stateBase64: upgraded.stateBase64, schemaVersion: 2, targetSchemaVersion: 1 })).toThrow('UNSUPPORTED')
})

import * as Y from 'yjs'
import { writeCanvasSnapshotToYDoc, encodeCanvasYDoc, decodeCanvasYDoc, materializeCanvasYDoc } from './canvas-yjs.js'

it('rejects an empty downgraded document against the authoritative host schema', () => {
  const doc = new Y.Doc()
  doc.getMap('canvas').set('schemaVersion', 1)
  writeCanvasSnapshotToYDoc(doc, { schema: {}, store: {} })
  const provider = new CanvasCollaborationProvider({} as CanvasService)
  expect(() => provider.validateDocument({ providerKey: 'canvas.document', resourceId: 'own-fixture', operation: 'write',
    stateBase64: encodeCanvasYDoc(doc).stateBase64, schemaVersion: 2 })).toThrow('CANVAS_SCHEMA_MISMATCH')
})
