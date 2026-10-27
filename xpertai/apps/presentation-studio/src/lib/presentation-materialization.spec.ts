jest.mock('./presentation-source.js', () => ({ persistPresentationSource: jest.fn() }))
import type { CollaborationMaterializationEvent } from '@xpert-ai/plugin-sdk'
import { PresentationStudioService } from './presentation-studio.service.js'
import { persistPresentationSource } from './presentation-source.js'
import { createPresentationYDoc, encodeYDoc } from './presentation-yjs.js'

it('reports a source failure after committing the native projection so the platform can retry', async () => {
  const doc = createPresentationYDoc({ title: 'Durable content', goal: 'Keep edits', themePack: 'theme01', pageCount: 1,
    slides: [{ id: 'slide', layout: 'theme01_page001', status: 'active', props: { title: 'Human text' } }] })
  const encoded = encodeYDoc(doc)
  doc.destroy()
  const deck = { revision: 3, yjsUpdateCount: 0 }
  const native = { findOne: jest.fn().mockResolvedValue(deck), save: jest.fn().mockResolvedValue(deck) }
  const repository = { manager: { transaction: async (work: (manager: object) => Promise<void>) => work({ getRepository: () => native }) } }
  const service = new PresentationStudioService(repository as never, {} as never, undefined, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never)
  const event: CollaborationMaterializationEvent = { providerKey: 'presentation-studio', resourceId: 'deck', operation: 'materialize',
    documentId: 'document', stateBase64: encoded.stateBase64, stateVectorBase64: encoded.stateVectorBase64,
    sequenceNumber: 4, tenantId: 'tenant', organizationId: 'org', projectId: 'project', userId: 'member' }
  jest.mocked(persistPresentationSource).mockResolvedValueOnce('failed').mockResolvedValueOnce('synced')
  await expect(service.materializeCollaborationDocument(event)).rejects.toThrow('PRESENTATION_SOURCE_NOT_SYNCED')
  expect(native.save).toHaveBeenCalledWith(expect.objectContaining({ revision: 4, title: 'Durable content' }))
  await expect(service.materializeCollaborationDocument(event)).resolves.toBeUndefined()
  expect(deck.revision).toBe(4)
  expect(persistPresentationSource).toHaveBeenCalledTimes(2)
})
