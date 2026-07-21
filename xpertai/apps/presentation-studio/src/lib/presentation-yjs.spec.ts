import * as Y from 'yjs'
import {
  createPresentationYDoc,
  ensurePresentationYDocSchemaV2,
  materializePresentationYDoc,
  patchPresentationYDoc,
  patchSlideYMap
} from './presentation-yjs.js'
import type { PresentationDeckSpec } from './types.js'

const spec: PresentationDeckSpec = {
  title: 'Concurrent deck', goal: 'Verify field-level convergence', themePack: 'theme01', pageCount: 3,
  slides: [{ id: 'slide-1', layout: 'theme01_page001', status: 'active', props: { title: 'Original', metric: 1 } }]
}

describe('Presentation Yjs document', () => {
  it('round-trips the explicit custom theme discriminator and identity', () => {
    const custom: PresentationDeckSpec = {
      ...spec,
      themePack: 'theme12345678901234567890',
      theme: { type: 'custom', key: 'theme12345678901234567890', themeId: 'theme-record-1' }
    }
    const materialized = materializePresentationYDoc(createPresentationYDoc(custom))

    expect(materialized.spec.themePack).toBe(custom.themePack)
    expect(materialized.spec.theme).toEqual(custom.theme)
  })

  it('converges concurrent edits to distinct nested props', () => {
    const left = createPresentationYDoc(spec)
    const right = new Y.Doc()
    Y.applyUpdate(right, Y.encodeStateAsUpdate(left))

    const leftUpdate = patchPresentationYDoc(left, ({ slides }) => {
      const slide = slides.get('slide-1')
      if (!slide) throw new Error('missing slide')
      patchSlideYMap(slide, { props: { title: 'Edited title' } })
    }, 'left')
    const rightUpdate = patchPresentationYDoc(right, ({ slides }) => {
      const slide = slides.get('slide-1')
      if (!slide) throw new Error('missing slide')
      patchSlideYMap(slide, { props: { metric: 42 } })
    }, 'right')

    Y.applyUpdate(left, rightUpdate)
    Y.applyUpdate(right, leftUpdate)
    const leftResult = materializePresentationYDoc(left)
    const rightResult = materializePresentationYDoc(right)
    expect(leftResult.spec).toEqual(rightResult.spec)
    expect(leftResult.spec.slides[0].props).toMatchObject({ title: 'Edited title', metric: 42 })
  })

  it('materializes skipped and deleted slide state', () => {
    const doc = createPresentationYDoc(spec)
    patchPresentationYDoc(doc, ({ deck, slides }) => {
      slides.get('slide-1')?.set('status', 'skipped')
      deck.set('status', 'reviewed')
    }, 'status')
    const result = materializePresentationYDoc(doc)
    expect(result.editorState.skippedSlides).toEqual(['slide-1'])
    expect(result.spec.slides[0].status).toBe('skipped')
    expect(result.status).toBe('reviewed')
  })

  it('stores editable text as Y.Text and migrates legacy strings without changing content', () => {
    const current = createPresentationYDoc(spec, {
      slideOrder: ['slide-1'], skippedSlides: [], deletedSlides: [], duplicatedSlides: [],
      text: { 'text:theme01_page001:p0': 'Collaborative text' }, props: { 'slide-1': spec.slides[0].props }, preview: {}
    })
    expect(current.getMap<string | Y.Text>('texts').get('text:theme01_page001:p0')).toBeInstanceOf(Y.Text)

    const legacy = new Y.Doc()
    legacy.getMap<string | Y.Text>('texts').set('text:theme01_page001:p0', 'Legacy text')
    expect(ensurePresentationYDocSchemaV2(legacy)).toBe(true)
    expect(legacy.getMap<string | Y.Text>('texts').get('text:theme01_page001:p0')).toBeInstanceOf(Y.Text)
    expect((legacy.getMap<string | Y.Text>('texts').get('text:theme01_page001:p0') as Y.Text).toString()).toBe('Legacy text')
  })
})
