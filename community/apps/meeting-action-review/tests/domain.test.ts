import { describe, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createSchema, extractionSchema, editItemsSchema } from '../src/lib/schemas.js'
import { acceptItems, reviewItems, segmentSource } from '../src/lib/domain.js'
import { newId } from '../remote/uuid.js'

describe('meeting action business boundaries', () => {
  it('produces server-accepted UUIDs using the HTTP-compatible crypto API', () => {
    const ids = Array.from({ length: 50 }, () => newId())
    expect(new Set(ids).size).toBe(50)
    for (const operationId of ids) expect(createSchema.safeParse({ operationId, title: '会议', sourceText: '原文' }).success).toBe(true)
  })
  it('rejects empty and oversized input without truncation; preserves Unicode offsets', () => {
    expect(createSchema.safeParse({ title: ' ', sourceText: 'hello', operationId: randomUUID() }).success).toBe(false)
    expect(createSchema.safeParse({ title: '会议', sourceText: '文'.repeat(10001), operationId: randomUUID() }).success).toBe(false)
    const { sourceText } = createSchema.parse({ title: '会议', sourceText: '🙂周五交付\r\n\r\n由小李负责', operationId: randomUUID() })
    const parts = segmentSource(sourceText)
    expect(parts.segments.map(s => sourceText.slice(s.start,s.end))).toEqual(['🙂周五交付','由小李负责'])
  })
  it('accepts real empty results and rejects forged references atomically', () => {
    const source = segmentSource('小李周五前整理接口清单')
    expect(acceptItems(extractionSchema.parse({ items: [] }), source)).toEqual([])
    expect(() => acceptItems({ items: [{ task: '整理接口', owner: '小李', deadlineText: '周五前', sourceSegmentIds: ['S099'], reviewNote: null }] }, source)).toThrow('SOURCE_REFERENCE_INVALID')
  })
  it('preserves AI evidence and distinguishes manual additions from human edits', () => {
    const initial = acceptItems({ items: [{ task: '整理接口', owner: null, deadlineText: null, sourceSegmentIds: ['S001'], reviewNote: '需核对范围' }] }, segmentSource('整理接口'))
    const result = reviewItems([{ id: initial[0].id, task: '整理接口', owner: '小李', deadlineText: null }, { id: randomUUID(), task: '人工补充', owner: null, deadlineText: null }], initial)
    expect(result[0]).toMatchObject({ humanAdjusted: true, sourceSegmentIds: ['S001'], reviewNote: '需核对范围' })
    expect(result[1]).toMatchObject({ origin: 'manual', sourceSegmentIds: [], humanAdjusted: false })
    expect(initial[0].owner).toBeNull()
  })
  it('rejects blank actions, duplicate IDs and client-written provenance', () => {
    const id = randomUUID(), item = { id, task: '执行', owner: null, deadlineText: null }
    expect(editItemsSchema.safeParse([item,item]).success).toBe(false)
    expect(editItemsSchema.safeParse([{ ...item, task: ' ' }]).success).toBe(false)
    expect(editItemsSchema.safeParse([{ ...item, origin: 'ai' }]).success).toBe(false)
    expect(extractionSchema.safeParse({ items: [], tenantId: randomUUID() }).success).toBe(false)
  })
})
