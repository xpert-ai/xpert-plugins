import { PresentationDeck } from './entities/index.js'
import { createPresentationYDoc, encodeYDoc } from './presentation-yjs.js'
import { presentationSearchProjection } from './presentation-search.js'
import type { PresentationDeckSpec } from './types.js'

it('indexes declared copy and native text overrides, never arbitrary props or retired slides', () => {
  const spec: PresentationDeckSpec = { kind: 'standard', title: 'Public title', goal: 'Purpose', themePack: 'theme01', pageCount: 1,
    slides: [{ id: 'slide-1', layout: 'cover', status: 'active' as const, props: { lines: [{ copy: 'Visible copy' }], apiDescription: 'private config' } },
      { id: 'slide-2', layout: 'retired', status: 'deleted' as const, props: { text: 'Old content' } }] }
  const doc = createPresentationYDoc(spec, {
    slideOrder: ['slide-1', 'slide-2'], skippedSlides: [], deletedSlides: [], duplicatedSlides: [],
    text: { 'text:cover:title': 'Edited title' }, props: {}, preview: {}
  })
  const deck = Object.assign(new PresentationDeck(), { id: 'deck', title: spec.title, goal: spec.goal, revision: 4, lifecycleRevision: 2,
    deckSpec: spec, yjsStateBase64: encodeYDoc(doc).stateBase64 })
  doc.destroy()
  const result = presentationSearchProjection(deck, { cover: ['lines[].copy'] })
  expect(result.revision).toBe('4:2')
  expect(result.sections[1]).toEqual({ anchor: { kind: 'slide', id: 'slide-1' }, text: 'Visible copy\nEdited title' })
  expect(JSON.stringify(result)).not.toContain('private config')
  expect(JSON.stringify(result)).not.toContain('Old content')
})
