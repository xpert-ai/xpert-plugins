import assert from 'node:assert/strict'
import test from 'node:test'
import { LucidchartArtifactViewerService } from './lucidchart-artifact-viewer.service.js'
import type { LucidchartDocumentVersion } from './entities/index.js'
import { LucidchartService } from './lucidchart.service.js'

test('renders persisted Lucid Standard Import shapes into a self-contained SVG viewer', () => {
  const result = new LucidchartArtifactViewerService().render({
    title: 'Approval flow',
    version: {
      versionNumber: 2,
      documentId: 'document-1',
      standardImport: {
        pages: [
          {
            shapes: [
              { id: 'start', type: 'rectangle', text: 'Request', boundingBox: { x: 20, y: 20, width: 160, height: 70 } }
            ]
          }
        ]
      }
    } as LucidchartDocumentVersion
  })
  const html = result.buffer.toString('utf8')
  assert.match(html, /Approval flow/)
  assert.match(html, /Request/)
  assert.match(html, /<svg class="diagram"/)
  assert.equal(result.shapeCount, 1)
})

test('renders actual Mermaid source when Standard Import has no previewable shapes', () => {
  const result = new LucidchartArtifactViewerService().render({
    title: 'Mermaid draft',
    version: {
      versionNumber: 1,
      documentId: 'document-1',
      mermaidSource: 'flowchart LR\nA-->B'
    } as LucidchartDocumentVersion
  })
  assert.match(result.buffer.toString('utf8'), /flowchart LR/)
})

test('requires explicit confirmation before publishing a public Lucidchart link', async () => {
  const documentRepository = {
    findOne: async () => ({ id: 'document-1', title: 'Flow', status: 'draft', currentVersionId: 'version-1' })
  }
  const versionRepository = {
    findOne: async () => ({ id: 'version-1', documentId: 'document-1', versionNumber: 1, standardImport: {} })
  }
  const service = new LucidchartService(documentRepository as never, versionRepository as never, {} as never)
  await assert.rejects(
    service.publishArtifact(
      { tenantId: 'tenant-1' },
      { documentId: 'document-1', accessMode: 'public_link', userConfirmedPublicLink: false }
    ),
    /explicit user confirmation/
  )
})
