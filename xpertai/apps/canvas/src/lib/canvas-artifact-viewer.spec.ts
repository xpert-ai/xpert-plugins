import { BadRequestException } from '@nestjs/common'
import {
  CANVAS_ARTIFACT_MAX_SVG_BYTES,
  CanvasArtifactViewerService,
  validateCanvasArtifactSvg
} from './canvas-artifact-viewer.service.js'

const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#fff"/><text x="20" y="40">Canvas</text></svg>'

describe('CanvasArtifactViewerService', () => {
  it('renders a self-contained, interactive, read-only HTML viewer', () => {
    const result = new CanvasArtifactViewerService().render({
      title: 'Offline architecture',
      description: 'Agent workflow',
      revision: 7,
      pageName: 'Page 1',
      svg: safeSvg,
      width: 640,
      height: 400
    })
    const html = result.buffer.toString('utf8')

    expect(result.mimeType).toBe('text/html')
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain('data:image/svg+xml;base64,')
    expect(html).toContain('Published Canvas · r7')
    expect(html).not.toContain('<text x="20"')
  })

  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject onload="alert(1)"/></svg>',
    '<div>not svg</div>'
  ])('rejects unsafe or external SVG content', (svg) => {
    expect(() => validateCanvasArtifactSvg(svg)).toThrow(BadRequestException)
  })

  it.each([
    'url(#_export_1_r1__shape_clip)',
    'url("#_export_1_r1__shape_clip")',
    'url(&quot;#_export_1_r1__shape_clip&quot;)',
    'url(&#34;#_export_1_r1__shape_clip&#34;)'
  ])('accepts a safe local CSS fragment serialized as %s', (cssUrl) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="_export_1_r1__shape_clip"><rect width="10" height="10"/></clipPath></defs><g style="clip-path:${cssUrl}"><rect width="10" height="10"/></g></svg>`

    expect(validateCanvasArtifactSvg(svg)).toBe(svg)
  })

  it.each([
    'url(https://example.com/clip.svg#clip)',
    'url(&quot;https://example.com/clip.svg#clip&quot;)',
    'url(&quot;#safe&quot; https://example.com/clip.svg)',
    'url("")'
  ])('rejects an external, mixed, or empty CSS reference serialized as %s', (cssUrl) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect style="clip-path:${cssUrl}" width="10" height="10"/></svg>`

    expect(() => validateCanvasArtifactSvg(svg)).toThrow(/external or unsafe CSS URL/i)
  })

  it('rejects SVG content over the publication limit', () => {
    const oversized = `<svg xmlns="http://www.w3.org/2000/svg"><desc>${'x'.repeat(CANVAS_ARTIFACT_MAX_SVG_BYTES)}</desc></svg>`
    expect(() => validateCanvasArtifactSvg(oversized)).toThrow(/oversized SVG/i)
  })
})
