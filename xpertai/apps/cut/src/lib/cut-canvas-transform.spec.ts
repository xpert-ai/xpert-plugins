import { moveCutTransform, resizeCutTransform, rotateCutTransform } from './cut-canvas-transform.js'

describe('Cut canvas transforms', () => {
  const transform = { x: 100, y: 80, width: 400, height: 240, rotation: 0, opacity: 1 }
  const bounds = { width: 1920, height: 1080 }

  it('moves an element while keeping it inside the composition', () => {
    expect(moveCutTransform(transform, 75, -120, bounds)).toMatchObject({ x: 175, y: 0 })
    expect(moveCutTransform(transform, 2000, 2000, bounds)).toMatchObject({ x: 1520, y: 840 })
  })

  it('resizes from each anchored corner', () => {
    expect(resizeCutTransform(transform, 'south-east', 80, 60, bounds)).toMatchObject({ x: 100, y: 80, width: 480, height: 300 })
    expect(resizeCutTransform(transform, 'north-west', 60, 40, bounds)).toMatchObject({ x: 160, y: 120, width: 340, height: 200 })
    expect(resizeCutTransform(transform, 'south-west', -200, 30, bounds)).toMatchObject({ x: 0, width: 500, height: 270 })
  })

  it('rotates by the pointer angle delta', () => {
    expect(rotateCutTransform(transform, 0, Math.PI / 2).rotation).toBe(90)
  })
})
