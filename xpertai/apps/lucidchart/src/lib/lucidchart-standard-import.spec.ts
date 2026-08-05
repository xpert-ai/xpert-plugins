import assert from 'node:assert/strict'
import test from 'node:test'
import { applyDiagramStageSchema, createAgentDocumentSchema } from './lucidchart-agent-tool.schemas.js'
import {
  applyStandardImportStage,
  readStandardImportPage,
  summarizeStandardImportDraft,
  validateStandardImportDraft
} from './lucidchart-standard-import.js'

test('assembles bounded DTOs into official Lucid Standard Import shapes and lines', () => {
  const draft = applyStandardImportStage(null, {
    documentId: 'document-1',
    expectedRevision: 0,
    pageId: 'page-1',
    pageTitle: 'Main Flow',
    pageSettings: { fillColor: '#F8FAFC', width: 1600, height: 900 },
    stageName: 'core flow',
    shapes: [
      { id: 'start', type: 'terminator', x: 40, y: 80, width: 180, height: 70, text: 'Start', fillColor: '#DBEAFE' },
      { id: 'review', type: 'decision', x: 320, y: 80, width: 180, height: 120, text: 'Approved?' }
    ],
    lines: [{ id: 'start-review', fromShapeId: 'start', toShapeId: 'review', label: 'submit' }]
  })
  const page = (draft.pages as Array<Record<string, any>>)[0]
  assert.equal(draft.version, 1)
  assert.deepEqual(page.settings.size, { type: 'custom', w: 1600, h: 900 })
  assert.deepEqual(page.shapes[0].boundingBox, { x: 40, y: 80, w: 180, h: 70 })
  assert.deepEqual(page.shapes[0].style.fill, { type: 'color', color: '#DBEAFE' })
  assert.deepEqual(page.lines[0].endpoint1, { type: 'shapeEndpoint', style: 'none', shapeId: 'start' })
  assert.deepEqual(page.lines[0].endpoint2, { type: 'shapeEndpoint', style: 'arrow', shapeId: 'review' })
  assert.deepEqual(page.lines[0].text, [{ text: 'submit', position: 0.5, side: 'middle' }])
  assert.doesNotThrow(() => validateStandardImportDraft(draft))
})

test('upserts existing items and returns bounded page reads', () => {
  const initial = applyStandardImportStage(null, {
    documentId: 'document-1', expectedRevision: 0, pageId: 'page-1', pageTitle: 'Flow', stageName: 'initial',
    shapes: [{ id: 'node-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, text: 'Old' }]
  })
  const updated = applyStandardImportStage(initial, {
    documentId: 'document-1', expectedRevision: 1, pageId: 'page-1', stageName: 'update',
    shapes: [{ id: 'node-1', type: 'process', x: 20, y: 30, width: 140, height: 60, text: 'New' }]
  })
  assert.deepEqual(summarizeStandardImportDraft(updated), {
    pageCount: 1,
    shapeCount: 1,
    lineCount: 0,
    pages: [{ id: 'page-1', title: 'Flow', shapeCount: 1, lineCount: 0 }],
    byteSize: Buffer.byteLength(JSON.stringify(updated), 'utf8')
  })
  const page = readStandardImportPage(updated, 'page-1', 0, 1)
  assert.equal(page.total, 1)
  assert.equal(page.items[0].kind, 'shape')
  assert.equal((page.items[0].value as Record<string, unknown>).type, 'process')
})

test('rejects dangling line references before persisting a stage', () => {
  assert.throws(
    () => applyStandardImportStage(null, {
      documentId: 'document-1', expectedRevision: 0, pageId: 'page-1', pageTitle: 'Flow', stageName: 'invalid',
      lines: [{ id: 'line-1', fromShapeId: 'missing-a', toShapeId: 'missing-b' }]
    }),
    /missing source shape/
  )
})

test('tool schemas reject full arbitrary documents and stages above the hard operation limit', () => {
  assert.equal(createAgentDocumentSchema.safeParse({ title: 'Flow', standardImport: { pages: [] } }).success, false)
  const shapes = Array.from({ length: 13 }, (_, index) => ({
    id: `shape-${index}`, type: 'rectangle' as const, x: index * 10, y: 0, width: 100, height: 50
  }))
  const parsed = applyDiagramStageSchema.safeParse({
    documentId: 'document-1', expectedRevision: 0, pageId: 'page-1', pageTitle: 'Flow', stageName: 'too large', shapes
  })
  assert.equal(parsed.success, false)
})
