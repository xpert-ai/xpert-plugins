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
