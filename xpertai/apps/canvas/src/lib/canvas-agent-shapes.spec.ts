jest.mock('fractional-indexing', () => {
  let sequence = 0
  return { generateKeyBetween: jest.fn(() => `a${sequence++}`) }
})

import { assertRequestedRecordsSurvivedNormalization } from './canvas-agent-records.js'
import { createCanvasAgentShapeRecords } from './canvas-agent-shapes.js'
import type { CanvasRecord, CreateCanvasAgentShapeInput } from './types.js'

describe('Canvas Agent simplified shape creation', () => {
  it('generates a page, ids, indices, tldraw defaults, and richText', () => {
    const store: Record<string, CanvasRecord> = {}
    const inputs: CreateCanvasAgentShapeInput[] = [
      { id: 'shape:frame', type: 'frame', x: 0, y: 0, name: 'Section' },
      { type: 'text', parentId: 'shape:frame', x: 20, y: 30, text: '测试\n第二行' },
      { type: 'geo', x: 400, y: 0, text: 'Card', fill: 'semi' },
      { type: 'note', x: 400, y: 140, text: 'Remember this' },
      { type: 'arrow', start: { x: 100, y: 100 }, end: { x: 300, y: 180 }, text: 'Next' }
    ]

    const records = createCanvasAgentShapeRecords(store, inputs)

    expect(store['page:page']).toEqual({
      id: 'page:page',
      typeName: 'page',
      name: 'Page 1',
      index: expect.any(String),
      meta: {}
    })
    expect(records).toHaveLength(5)
    expect(records[1].id).toMatch(/^shape:/)
    expect(records[1]).toEqual(expect.objectContaining({
      typeName: 'shape',
      type: 'text',
      parentId: 'shape:frame',
      rotation: 0,
      opacity: 1,
      isLocked: false
    }))
    expect(records[1].props).toEqual(expect.objectContaining({
      color: 'black',
      size: 'm',
      font: 'draw',
      textAlign: 'start',
      scale: 1,
      autoSize: true,
      richText: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: '测试' }] },
          { type: 'paragraph', content: [{ type: 'text', text: '第二行' }] }
        ]
      }
    }))
    expect(records[2].props).toEqual(expect.objectContaining({ w: 100, h: 100, geo: 'rectangle', fill: 'semi' }))
    expect(records[3].props).toEqual(expect.objectContaining({ textFirstEditedBy: null, fontSizeAdjustment: 1 }))
    expect(records[4]).toEqual(expect.objectContaining({ x: 100, y: 100, type: 'arrow' }))
    expect(records[4].props).toEqual(expect.objectContaining({
      start: { x: 0, y: 0 },
      end: { x: 200, y: 80 },
      arrowheadEnd: 'arrow'
    }))
    expect(new Set(records.filter((record) => record.parentId === 'page:page').map((record) => record.index)).size).toBe(4)
  })

  it('requires an explicit parent when the Canvas has multiple pages', () => {
    const store: Record<string, CanvasRecord> = {
      'page:first': { id: 'page:first', typeName: 'page', name: 'First', index: 'a0', meta: {} },
      'page:second': { id: 'page:second', typeName: 'page', name: 'Second', index: 'a1', meta: {} }
    }

    expect(() => createCanvasAgentShapeRecords(store, [
      { type: 'text', x: 0, y: 0, text: 'Ambiguous parent' }
    ])).toThrow('[CANVAS_SHAPE_PARENT_REQUIRED]')
  })

  it('preserves the original per-record tldraw validation reason', () => {
    expect(() => assertRequestedRecordsSurvivedNormalization(
      { schema: {}, store: {} },
      ['shape:broken'],
      [{
        id: 'shape:broken',
        typeName: 'shape',
        type: 'text',
        reason: 'At shape(type = text).props.size: Expected "s" or "m" or "l" or "xl", got undefined'
      }]
    )).toThrow(
      '[CANVAS_INVALID_RECORD_BATCH] shape:broken: At shape(type = text).props.size: Expected "s" or "m" or "l" or "xl", got undefined'
    )
  })
})
