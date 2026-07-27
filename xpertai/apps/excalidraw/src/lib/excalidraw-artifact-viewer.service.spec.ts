import { BadRequestException } from '@nestjs/common'
import {
  ExcalidrawArtifactViewerService,
  sanitizeArtifactScene,
  serializeForInlineScript
} from './excalidraw-artifact-viewer.service.js'

describe('ExcalidrawArtifactViewerService', () => {
  it('renders a self-contained HTML viewer without external asset references', async () => {
    const result = await new ExcalidrawArtifactViewerService().render({
      title: '架构图 </script>',
      revision: 4,
      versionNumber: 2,
      scene: {
        elements: [element({ id: 'rect-1', link: 'https://example.test/docs' })],
        appState: { theme: 'dark', viewBackgroundColor: '#121212', collaborators: { private: true } },
        files: {}
      }
    })

    const html = result.buffer.toString('utf8')
    expect(result.mimeType).toBe('text/html')
    expect(result.size).toBe(result.buffer.byteLength)
    expect(result.sha256).toBe(result.checksum)
    expect(html).toContain('window.__XPERT_EXCALIDRAW_ARTIFACT__=')
    expect(html).toContain('Published Excalidraw')
    expect(html).not.toContain('<script>架构图 </script>')
    const documentHead = html.slice(0, html.indexOf('<script>window.__XPERT_EXCALIDRAW_ARTIFACT__='))
    expect(documentHead).not.toMatch(/<script\s+src=/i)
    expect(documentHead).not.toMatch(/<link\s+[^>]*href=/i)
    expect(documentHead).toContain('font-src data: https:')
    expect(documentHead).toContain("connect-src 'none'")
    const payloadScript = html.split('<script>window.__XPERT_EXCALIDRAW_ARTIFACT__=')[1]?.split('</script>')[0] ?? ''
    expect(payloadScript).not.toContain('collaborators')
  })

  it('strips unsafe links, custom data, transient app state, and embeddable URLs', () => {
    const scene = sanitizeArtifactScene({
      elements: [
        element({ id: 'safe', link: 'https://example.test/path', customData: { secret: true } }),
        element({ id: 'unsafe', link: 'javascript:alert(1)' }),
        element({ id: 'embed', type: 'embeddable', link: 'https://video.example.test' })
      ],
      appState: { theme: 'light', selectedElementIds: { safe: true }, viewBackgroundColor: 'url(https://bad.test)' },
      files: {}
    })

    expect(scene.elements[0].link).toBe('https://example.test/path')
    expect(scene.elements[0].customData).toBeUndefined()
    expect(scene.elements[1].link).toBeNull()
    expect(scene.elements[2].link).toBeNull()
    expect(scene.appState).toEqual({ theme: 'light', viewBackgroundColor: '#ffffff' })
  })

  it('rejects external image files and active SVG image data', () => {
    expect(() => sanitizeArtifactScene({
      elements: [element({ id: 'image-1', type: 'image', fileId: 'file-1' })],
      appState: {},
      files: { 'file-1': { id: 'file-1', dataURL: 'https://example.test/image.png', mimeType: 'image/png' } }
    })).toThrow(BadRequestException)

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')
    expect(() => sanitizeArtifactScene({
      elements: [element({ id: 'image-2', type: 'image', fileId: 'file-2' })],
      appState: {},
      files: { 'file-2': { id: 'file-2', dataURL: `data:image/svg+xml;base64,${svg}`, mimeType: 'image/svg+xml' } }
    })).toThrow(/unsafe/i)
  })

  it('escapes values that could terminate an inline script', () => {
    const value = serializeForInlineScript({ text: '</script>&\u2028\u2029' })
    expect(value).not.toContain('</script>')
    expect(value).toContain('\\u003c/script\\u003e')
    expect(value).toContain('\\u0026')
  })
})

function element(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rect-1',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    isDeleted: false,
    ...overrides
  }
}
