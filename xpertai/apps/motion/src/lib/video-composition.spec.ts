import { createStarterVideoComposition, validateVideoComposition } from './video-composition.js'

describe('Motion video composition', () => {
  it('creates a valid starter composition', () => {
    const composition = createStarterVideoComposition('Motion Launch')
    expect(composition.w).toBe(1280)
    expect(validateVideoComposition(composition)).toBe(composition)
    expect(composition.layers?.[0]?.tracks).toBeTruthy()
  })

  it('rejects empty or invalid compositions', () => {
    expect(() => validateVideoComposition({})).toThrow('requires scenes or layers')
    expect(() => validateVideoComposition({ w: -1, layers: [{}] })).toThrow('width is invalid')
  })

  it('validates layer tracks and motion paths', () => {
    const composition = validateVideoComposition({
      w: 1280,
      h: 720,
      scenes: [
        {
          id: 'scene-1',
          duration: 4,
          transition: 'push',
          layers: [
            {
              id: 'title',
              type: 'text',
              x: 640,
              y: 360,
              path: { kind: 'line', points: [{ x: 120, y: 300 }, { x: 960, y: 300 }] },
              tracks: {
                opacity: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }],
                offset: [{ t: 0, v: 0 }, { t: 4, v: 1 }]
              }
            }
          ]
        }
      ]
    })
    expect(composition.scenes?.[0]?.layers?.[0]?.path?.points).toHaveLength(2)
    expect(() =>
      validateVideoComposition({
        layers: [
          {
            type: 'text',
            tracks: { opacity: [{ t: 'bad', v: 1 }] }
          }
        ]
      })
    ).toThrow('tracks.opacity.0 is invalid')
  })
})
