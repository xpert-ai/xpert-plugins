import assert from 'node:assert/strict'
import test from 'node:test'
import { deflateRawSync } from 'node:zlib'
import {
  DrawioArtifactViewerService,
  findReferencedStencilNames,
  validatePublishedSvg
} from './drawio-artifact-viewer.service.js'
import type { DrawioDrawingVersion } from './entities/index.js'
import { DrawioService } from './drawio.service.js'

test('renders persisted draw.io XML with the official self-contained diagrams.net viewer', async () => {
  const result = await new DrawioArtifactViewerService().render({
    title: 'Checkout flow',
    version: {
      versionNumber: 3,
      drawingId: 'drawing-1',
      xml: '<mxGraphModel><root><mxCell id="1" vertex="1" value="Checkout"><mxGeometry x="20" y="30" width="160" height="70"/></mxCell></root></mxGraphModel>'
    } as DrawioDrawingVersion
  })
  const html = result.buffer.toString('utf8')
  assert.match(html, /Checkout flow/)
  assert.match(html, /data-mxgraph=/)
  assert.match(html, /GraphViewer\.processElements/)
  assert.match(html, /mxClient=\{VERSION:"31\.1\.5"/)
  assert.doesNotMatch(html, /window\.__DRAWIO_XML__/)
  assert.equal(result.mimeType, 'text/html')
})

test('embeds only the official stencil sets referenced by the diagram', async () => {
  const result = await new DrawioArtifactViewerService().render({
    title: 'AWS flow',
    version: {
      versionNumber: 1,
      drawingId: 'drawing-1',
      xml: '<mxGraphModel><root><mxCell id="1" vertex="1" style="shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;"/></root></mxGraphModel>'
    } as DrawioDrawingVersion
  })
  const html = result.buffer.toString('utf8')
  assert.match(html, /mxgraph\.aws4/)
  assert.ok(result.size < 15 * 1024 * 1024)
})

test('prefers official XML rendering when an Agent also supplies a preview', async () => {
  const result = await new DrawioArtifactViewerService().render({
    title: 'Canonical XML',
    version: {
      versionNumber: 1,
      drawingId: 'drawing-1',
      xml: '<mxGraphModel><root><mxCell id="1" vertex="1" value="XML wins"/></root></mxGraphModel>',
      previewSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>stale preview</text></svg>'
    } as DrawioDrawingVersion
  })
  const html = result.buffer.toString('utf8')
  assert.equal(result.sourceType, 'xml')
  assert.match(html, /XML wins/)
  assert.doesNotMatch(html, /stale preview/)
})

test('resolves nested stencil paths without allowing path traversal', () => {
  assert.deepEqual(
    findReferencedStencilNames(
      '<mxCell style="shape=mxgraph.cisco_safe.compositeIcon;resIcon=mxgraph.cisco_safe.capability.secure_access;"/><mxCell style="shape=mxgraph...evil;"/>'
    ),
    ['cisco_safe', 'cisco_safe/capability']
  )
})

test('resolves stencil sets from the compressed XML saved by the draw.io workbench', () => {
  const model = '<mxGraphModel><root><mxCell style="shape=mxgraph.gcp2.compute;"/></root></mxGraphModel>'
  const compressed = deflateRawSync(Buffer.from(encodeURIComponent(model), 'utf8')).toString('base64')
  assert.deepEqual(
    findReferencedStencilNames(`<mxfile><diagram id="page-1">${compressed}</diagram></mxfile>`),
    ['gcp2']
  )
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
    findOne: async () => ({
      id: 'version-1',
      drawingId: 'drawing-1',
      versionNumber: 1,
      xml: '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
    })
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

test('rejects truncated Agent XML before creating a drawing record', async () => {
  let saveCalls = 0
  const drawingRepository = {
    create: (value: unknown) => value,
    save: async (value: unknown) => {
      saveCalls += 1
      return value
    }
  }
  const service = new DrawioService(drawingRepository as never, {} as never, {} as never)
  await assert.rejects(
    service.createDrawing(
      { tenantId: 'tenant-1' },
      {
        title: 'Truncated diagram',
        xml: '<mxfile>\n<diagram><mxGraphModel><root>\n<mxCell id="flow6" style="strokeWidth=2;fontSize'
      }
    ),
    /truncated.*Nothing was saved/i
  )
  assert.equal(saveCalls, 0)
})
