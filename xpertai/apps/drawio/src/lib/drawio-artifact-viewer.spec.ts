import assert from 'node:assert/strict'
import test from 'node:test'
import { DrawioArtifactViewerService, validatePublishedSvg } from './drawio-artifact-viewer.service.js'
import type { DrawioDrawingVersion } from './entities/index.js'
import { DrawioService } from './drawio.service.js'

test('renders persisted draw.io XML into a self-contained Artifact viewer', () => {
  const result = new DrawioArtifactViewerService().render({
    title: 'Checkout flow',
    version: {
      versionNumber: 3,
      drawingId: 'drawing-1',
      xml: '<mxGraphModel><root><mxCell id="1" vertex="1" value="Checkout"><mxGeometry x="20" y="30" width="160" height="70"/></mxCell></root></mxGraphModel>'
    } as DrawioDrawingVersion
  })
  const html = result.buffer.toString('utf8')
  assert.match(html, /Checkout flow/)
  assert.match(html, /window\.__DRAWIO_XML__/)
  assert.doesNotMatch(html, /viewer\.diagrams\.net/)
  assert.equal(result.mimeType, 'text/html')
})

test('rejects preview SVG that loads an external resource', () => {
  assert.throws(
    () =>
      validatePublishedSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.test/tracker.png"/></svg>'
      ),
    /unsafe SVG content/
  )
})

test('requires explicit confirmation before publishing a public draw.io link', async () => {
  const drawingRepository = {
    findOne: async () => ({ id: 'drawing-1', title: 'Flow', status: 'draft', currentVersionId: 'version-1' })
  }
  const versionRepository = {
    findOne: async () => ({ id: 'version-1', drawingId: 'drawing-1', versionNumber: 1, xml: '<mxGraphModel/>' })
  }
  const service = new DrawioService(drawingRepository as never, versionRepository as never, {} as never)
  await assert.rejects(
    service.publishArtifact(
      { tenantId: 'tenant-1' },
      { drawingId: 'drawing-1', accessMode: 'public_link', userConfirmedPublicLink: false }
    ),
    /explicit user confirmation/
  )
})
