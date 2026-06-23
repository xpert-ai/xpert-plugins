import {
  buildSceneDiffSteps,
  prepareSceneAnimationBaseElements
} from './scene-diff-animation.js'

describe('buildSceneDiffSteps', () => {
  it('adds new elements one by one in target order', () => {
    const current = [{ id: 'a', type: 'rectangle' }]
    const target = [
      { id: 'a', type: 'rectangle' },
      { id: 'b', type: 'text' },
      { id: 'c', type: 'arrow' }
    ]

    expect(buildSceneDiffSteps(current, target)).toEqual([
      {
        type: 'add',
        id: 'b',
        elements: [
          { id: 'a', type: 'rectangle' },
          { id: 'b', type: 'text' }
        ]
      },
      {
        type: 'add',
        id: 'c',
        elements: [
          { id: 'a', type: 'rectangle' },
          { id: 'b', type: 'text' },
          { id: 'c', type: 'arrow' }
        ]
      }
    ])
  })

  it('deletes removed elements one by one before other changes', () => {
    const current = [
      { id: 'a', type: 'rectangle' },
      { id: 'b', type: 'text' },
      { id: 'c', type: 'arrow' }
    ]
    const target = [{ id: 'a', type: 'rectangle' }]

    expect(buildSceneDiffSteps(current, target)).toEqual([
      {
        type: 'delete',
        id: 'b',
        elements: [
          { id: 'a', type: 'rectangle' },
          { id: 'c', type: 'arrow' }
        ]
      },
      {
        type: 'delete',
        id: 'c',
        elements: [{ id: 'a', type: 'rectangle' }]
      }
    ])
  })

  it('updates changed elements without touching identical elements', () => {
    const current = [
      { id: 'a', type: 'rectangle', x: 0 },
      { id: 'b', type: 'text', text: 'Before' }
    ]
    const target = [
      { id: 'a', type: 'rectangle', x: 0 },
      { id: 'b', type: 'text', text: 'After' }
    ]

    expect(buildSceneDiffSteps(current, target)).toEqual([
      {
        type: 'update',
        id: 'b',
        elements: [
          { id: 'a', type: 'rectangle', x: 0 },
          { id: 'b', type: 'text', text: 'After' }
        ]
      }
    ])
  })

  it('does not create steps when elements are unchanged', () => {
    const current = [
      { id: 'a', type: 'rectangle', x: 0 },
      { id: 'b', type: 'text', text: 'Same' }
    ]
    const target = [
      { id: 'a', type: 'rectangle', x: 0 },
      { id: 'b', type: 'text', text: 'Same' }
    ]

    expect(buildSceneDiffSteps(current, target)).toEqual([])
  })
})

describe('prepareSceneAnimationBaseElements', () => {
  it('drops old image fallback elements when Mermaid conversion target is structured', () => {
    const current = [
      { id: 'fallback', type: 'image', fileId: 'file-1' },
      { id: 'old-note', type: 'text', text: 'keep until diff removes it normally' }
    ]
    const target = [
      { id: 'graph-node', type: 'rectangle' },
      { id: 'graph-label', type: 'text' }
    ]

    expect(prepareSceneAnimationBaseElements(current, target, { discardCurrentImages: true })).toEqual([
      { id: 'old-note', type: 'text', text: 'keep until diff removes it normally' }
    ])
  })

  it('keeps current images when the target scene also contains images', () => {
    const current = [{ id: 'fallback', type: 'image', fileId: 'file-1' }]
    const target = [{ id: 'next-image', type: 'image', fileId: 'file-2' }]

    expect(prepareSceneAnimationBaseElements(current, target, { discardCurrentImages: true })).toEqual(current)
  })
})
