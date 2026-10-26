import * as Y from 'yjs'
import { PresentationStudioService } from './presentation-studio.service.js'
import { createPresentationYDoc, decodeYDoc, encodeYDoc, materializePresentationYDoc } from './presentation-yjs.js'
import type { PresentationDeckSpec } from './types.js'

function fixture() {
  const spec: PresentationDeckSpec = {
    title: 'Original deck', goal: 'Keep the content', themePack: 'theme01', pageCount: 3,
    slides: [{ id: 'slide-1', layout: 'theme01_page001', status: 'active', props: { title: 'Slide body' } }]
  }
  const doc = createPresentationYDoc(spec), initial = encodeYDoc(doc)
  let persisted = { id: 'deck-1', title: spec.title, revision: 7, deckSpec: materializePresentationYDoc(doc).spec,
    editorState: materializePresentationYDoc(doc).editorState, yjsStateBase64: initial.stateBase64 }
  doc.destroy()
  const collaboration = {
    ensureDocument: jest.fn().mockResolvedValue({ id: 'document-1' }),
    getDocumentState: jest.fn(async () => ({ updateBase64: persisted.yjsStateBase64, sequenceNumber: persisted.revision })),
    applyUpdate: jest.fn(async ({ updateBase64 }: { updateBase64: string }) => {
      const current = decodeYDoc(persisted.yjsStateBase64)
      Y.applyUpdate(current, Buffer.from(updateBase64, 'base64'))
      const materialized = materializePresentationYDoc(current)
      persisted = { ...persisted, title: materialized.spec.title, revision: persisted.revision + 1,
        deckSpec: materialized.spec, editorState: materialized.editorState, yjsStateBase64: encodeYDoc(current).stateBase64 }
      current.destroy()
    })
  }
  const logs = { create: jest.fn(value => value), save: jest.fn(async value => value) }
  const service = new PresentationStudioService(
    { findOne: jest.fn(async () => persisted) } as never,
    {} as never, undefined, {} as never, {} as never, logs as never,
    {} as never, {} as never, {} as never, undefined,
    { get: jest.fn(() => collaboration) } as never
  )
  return { service, collaboration, logs, current: () => persisted }
}

describe('Presentation metadata rename', () => {
  it('changes only the title through the shared document and attributes the update to the Agent', async () => {
    const f = fixture(), before = structuredClone(f.current())
    const result = await f.service.renameDeck({ assistantId: 'assistant-1' }, 'deck-1', 'New title', 7, 'agent')
    expect(result).toMatchObject({ deckId: 'deck-1', title: 'New title', revision: 8 })
    expect(f.current().deckSpec.slides).toEqual(before.deckSpec.slides)
    expect(f.current().editorState).toEqual(before.editorState)
    expect(f.collaboration.applyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      documentId: 'document-1', expectedSequence: 7, origin: 'presentation:agent:presentation_rename_deck',
      actor: expect.objectContaining({ actorType: 'agent' })
    }))
    expect(f.logs.create).toHaveBeenCalledWith(expect.objectContaining({ actor: 'agent', action: 'deck_renamed' }))
  })

  it('rejects an outdated revision without changing title or writing a success log', async () => {
    const f = fixture()
    await expect(f.service.renameDeck({}, 'deck-1', 'Stale title', 6, 'agent')).rejects.toThrow('revision conflict')
    expect(f.current().title).toBe('Original deck')
    expect(f.collaboration.applyUpdate).not.toHaveBeenCalled()
    expect(f.logs.save).not.toHaveBeenCalled()
  })

  it('retains the Workbench actor for existing callers', async () => {
    const f = fixture()
    await f.service.renameDeck({}, 'deck-1', 'Human title', 7)
    expect(f.collaboration.applyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      origin: 'workbench:rename-deck', actor: expect.objectContaining({ actorType: 'user' })
    }))
  })
})
