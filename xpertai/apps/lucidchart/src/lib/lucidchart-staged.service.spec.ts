import assert from 'node:assert/strict'
import test from 'node:test'
import { LucidchartService } from './lucidchart.service.js'
import type { LucidchartDocument, LucidchartDocumentVersion } from './entities/index.js'

test('persists staged draft revisions and finalizes exactly one validated version', async () => {
  let document: LucidchartDocument = {
    id: 'document-1',
    tenantId: 'tenant-1',
    title: 'Approval Flow',
    kind: 'flowchart',
    status: 'draft',
    product: 'lucidchart',
    currentVersionNumber: 0,
    standardImportDraftRevision: 0,
    standardImportDraftFinalizedRevision: -1
  }
  const versions: LucidchartDocumentVersion[] = []
  const documentRepository = {
    findOne: async () => document,
    create: (value: LucidchartDocument) => value,
    save: async (value: LucidchartDocument) => {
      document = { ...document, ...value }
      return document
    },
    update: async (criteria: Partial<LucidchartDocument>, value: Partial<LucidchartDocument>) => {
      if (
        criteria.id !== document.id ||
        criteria.standardImportDraftRevision !== document.standardImportDraftRevision
      ) return { affected: 0 }
      document = { ...document, ...value }
      return { affected: 1 }
    }
  }
  const versionRepository = {
    findOne: async ({ where }: { where: { id?: string } }) => versions.find((version) => version.id === where.id) ?? null,
    create: (value: LucidchartDocumentVersion) => value,
    save: async (value: LucidchartDocumentVersion) => {
      const version = { ...value, id: `version-${versions.length + 1}` }
      versions.push(version)
      return version
    }
  }
  const logs: unknown[] = []
  const logRepository = {
    create: (value: unknown) => value,
    save: async (value: unknown) => {
      logs.push(value)
      return value
    }
  }
  const service = new LucidchartService(documentRepository as never, versionRepository as never, logRepository as never)
  const scope = { tenantId: 'tenant-1', assistantId: 'assistant-1' }

  const staged = await service.applyDiagramStage(scope, {
    documentId: 'document-1', expectedRevision: 0, pageId: 'page-1', pageTitle: 'Main', stageName: 'core flow',
    shapes: [
      { id: 'start', type: 'terminator', x: 0, y: 0, width: 120, height: 60, text: 'Start' },
      { id: 'finish', type: 'terminator', x: 300, y: 0, width: 120, height: 60, text: 'Finish' }
    ],
    lines: [{ id: 'path', fromShapeId: 'start', toShapeId: 'finish' }]
  })
  assert.equal(staged.draftRevision, 1)
  assert.equal(document.standardImportDraftRevision, 1)
  assert.equal(versions.length, 0)

  await assert.rejects(
    service.applyDiagramStage(scope, {
      documentId: 'document-1', expectedRevision: 0, pageId: 'page-1', stageName: 'stale',
      shapes: [{ id: 'extra', type: 'rectangle', x: 0, y: 100, width: 100, height: 50 }]
    }),
    /revision changed/
  )

  const finalized = await service.finalizeDiagram(scope, {
    documentId: 'document-1', expectedRevision: 1, changeSummary: 'Ready for review'
  })
  assert.equal(finalized.versionNumber, 1)
  assert.equal(finalized.draftRevision, 2)
  assert.equal(versions.length, 1)
  assert.equal(document.standardImportDraftRevision, 2)
  assert.equal(document.standardImportDraftFinalizedRevision, 2)
  assert.equal((versions[0].standardImport as Record<string, unknown>).version, 1)
  assert.ok(logs.length >= 3)

  const summary = await service.getAgentDocument(scope, 'document-1')
  assert.equal(summary.hasUnfinalizedChanges, false)
  assert.equal(summary.summary.shapeCount, 2)
  assert.equal(summary.summary.lineCount, 1)
})
