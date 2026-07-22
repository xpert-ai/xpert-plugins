import { BadRequestException } from '@nestjs/common'
import { renderNodesToSVG } from '@open\u002dpencil/core/io'

jest.mock('@open\u002dpencil/core/io', () => ({
  renderNodesToSVG: jest.fn(() => '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"></svg>')
}))

jest.mock('@open\u002dpencil/core/scene-graph', () => ({
  SceneGraph: class MockSceneGraph {
    nodes = new Map<string, Record<string, unknown>>()
    images = new Map<string, Uint8Array>()
    variables = new Map<string, Record<string, unknown>>()
    variableCollections = new Map<string, Record<string, unknown>>()
    activeMode = new Map<string, string>()
    instanceIndex = new Map<string, Set<string>>()
    rootId = 'root'
    figKiwiVersion: number | null = null
    figSchemaDeflated: Uint8Array | null = null
    documentColorSpace = 'srgb'

    getPages() {
      return Array.from(this.nodes.values()).filter((node) => node.type === 'CANVAS')
    }
  }
}))

import {
  assertPublishedHtmlSize,
  PencilArtifactViewerService,
  PENCIL_ARTIFACT_MAX_HTML_BYTES,
  validatePublishedSvg
} from './pencil-artifact-viewer.service.js'
import { createEmptyPencilGraphSnapshot } from './pencil-graph.js'

describe('PencilArtifactViewerService', () => {
  it('renders a self-contained interactive HTML viewer', async () => {
    const graphSnapshot = createEmptyPencilGraphSnapshot()
    const firstPage = graphSnapshot.nodes.find(([, node]) => node.type === 'CANVAS')?.[1]
    const root = graphSnapshot.nodes.find(([id]) => id === graphSnapshot.rootId)?.[1]
    if (!firstPage || !root || !Array.isArray(root.childIds)) throw new Error('Empty Pencil graph fixture is invalid.')
    graphSnapshot.nodes.push(['page-2', { ...firstPage, id: 'page-2', name: 'Second page' }])
    graphSnapshot.nodes.push(['page-internal', { ...firstPage, id: 'page-internal', name: 'Internal page', internalOnly: true }])
    root.childIds = [...root.childIds, 'page-2', 'page-internal']

    const result = await new PencilArtifactViewerService().render({
      title: '<Design & review>',
      description: 'Read only',
      revision: 7,
      graphSnapshot
    })

    const html = result.buffer.toString('utf8')
    expect(result.mimeType).toBe('text/html')
    expect(result.pageCount).toBe(2)
    expect(result.sha256).toBe(result.checksum)
    expect(html).toContain('&lt;Design &amp; review&gt;')
    expect(html).toContain('data-action="fit"')
    expect(html).toContain('data-action="reset"')
    expect(html).toContain('data-action="fullscreen"')
    expect(html).toContain('requestFullscreen')
    expect(html).toContain('fullscreenchange')
    expect(html).toContain('viewer-fullscreen')
    expect(html).toContain('Second page')
    expect(html).not.toContain('Internal page')
    expect(html).not.toContain('https://example.com')
    expect(html).not.toContain('fetch(')
  })

  it('loads managed online fonts used by the published SVG', async () => {
    jest.mocked(renderNodesToSVG).mockReturnValueOnce(
      '<svg xmlns="http://www.w3.org/2000/svg"><text font-family="Caveat">Hello</text><text font-family="Unmanaged Font">World</text></svg>'
    )
    const result = await new PencilArtifactViewerService().render({
      title: 'Handwritten design',
      revision: 1,
      graphSnapshot: createEmptyPencilGraphSnapshot()
    })

    const html = result.buffer.toString('utf8')
    expect(html).toContain("font-family: 'Caveat'")
    expect(html).toContain('https://cdn.jsdelivr.net/npm/@fontsource/caveat@5.2.8/files/caveat-latin-400-normal.woff2')
    expect(html).not.toContain("font-family: 'Unmanaged Font'")
  })

  it.each([
    '<svg><script>alert(1)</script></svg>',
    '<svg><foreignObject><div>unsafe</div></foreignObject></svg>',
    '<svg><image href="https://example.com/image.png"/></svg>',
    '<svg><image href="data:image/svg+xml;base64,PHN2Zy8+"/></svg>',
    '<svg><rect onclick="alert(1)"/></svg>',
    '<svg><a href="javascript:alert(1)">unsafe</a></svg>',
    '<svg><image href=https://example.com/image.png></image></svg>'
  ])('rejects unsafe SVG content', (svg) => {
    expect(() => validatePublishedSvg(svg)).toThrow(BadRequestException)
  })

  it('allows fragment references with ordinary XML whitespace', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="shape"/></defs><use href = "#shape"/></svg>'
    expect(validatePublishedSvg(svg)).toBe(svg)
  })

  it('enforces the published HTML size limit', () => {
    expect(() => assertPublishedHtmlSize(PENCIL_ARTIFACT_MAX_HTML_BYTES + 1)).toThrow(BadRequestException)
  })

  it('renders a read-only empty state when the design has no public pages', async () => {
    const graphSnapshot = createEmptyPencilGraphSnapshot()
    graphSnapshot.nodes = graphSnapshot.nodes.map(([id, node]) =>
      node.type === 'CANVAS' ? [id, { ...node, internalOnly: true }] : [id, node]
    )

    const result = await new PencilArtifactViewerService().render({
      title: 'Empty design',
      revision: 2,
      graphSnapshot
    })

    expect(result.pageCount).toBe(0)
    expect(result.buffer.toString('utf8')).toContain('This design has no pages.')
  })
})
