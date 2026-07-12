import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PresentationCatalogService } from './presentation-catalog.service.js'
import { PresentationConfigService } from './presentation-config.service.js'
import { inlinePresentationHtml } from './presentation-html-inliner.js'
import { PresentationRendererService } from './presentation-renderer.service.js'
import type { PresentationDeckSpec, PresentationJsonObject } from './types.js'

describe('DashiAI renderer integration', () => {
  it('renders an upstream five-slide example with the prebuilt theme runtime', async () => {
    const catalog = new PresentationCatalogService()
    const config = new PresentationConfigService(undefined)
    const renderer = new PresentationRendererService(catalog, config, undefined)
    const examplePath = join(catalog.vendorProjectRoot(), '..', 'references', 'examples', 'portfolio.json')
    const example = JSON.parse(await readFile(examplePath, 'utf8')) as {
      title: string
      goal: string
      themePack: 'theme02'
      slides: Array<{ layout: string; props: PresentationJsonObject }>
    }
    const spec: PresentationDeckSpec = {
      title: example.title,
      goal: example.goal,
      themePack: example.themePack,
      pageCount: example.slides.length,
      slides: example.slides.map((slide, index) => ({ id: `slide-${index + 1}`, layout: slide.layout, status: 'active', props: slide.props }))
    }
    const version: Parameters<PresentationRendererService['renderVersion']>[0] = {
      deckId: 'integration-test',
      versionNumber: 1,
      source: 'system',
      deckSpec: spec,
      editorState: {
      slideOrder: spec.slides.map((slide) => slide.id), skippedSlides: [], deletedSlides: [], duplicatedSlides: [], text: {},
      props: Object.fromEntries(spec.slides.map((slide) => [slide.id, slide.props])), preview: {}
      },
      checksum: 'integration-test',
      rendererVersion: '0.1.0',
      upstreamCommit: '69ac66443e36e11cfca4a7f30721dc71a4278d28',
      yjsUpdateCount: 0
    }

    const result = await renderer.renderVersion(version, [])
    try {
      const html = await readFile(result.indexHtmlPath, 'utf8')
      expect(html).toContain('data-theme-pack="theme02"')
      expect(html).toContain('assets/imported-theme-runtime.js')
      expect(html).toContain('assets/fonts/font-pack.css')
      expect(html).toContain('assets/fonts/FONT-LICENSES.txt')
      expect(html).not.toContain('assets/vendor/fonts')
      expect(html.match(/class="slide/g)?.length).toBeGreaterThanOrEqual(5)
      const fontPack = JSON.parse(await readFile(join(result.directory, 'deck', 'ppt', 'assets', 'fonts', 'font-pack.json'), 'utf8')) as {
        packages: Array<{ name: string; version: string }>
        files: Array<{ path: string }>
      }
      expect(fontPack.packages.length).toBeGreaterThan(0)
      expect(fontPack.packages.length).toBeLessThan(10)
      expect(fontPack.packages.every((font) => /^@fontsource\/.+/.test(font.name) && /^\d+\.\d+\.\d+$/.test(font.version))).toBe(true)
      expect(fontPack.files.every((font) => font.path.endsWith('.woff2'))).toBe(true)
      const selfContained = await inlinePresentationHtml(join(result.directory, 'deck', 'ppt'), 160 * 1024 * 1024)
      expect(selfContained).not.toMatch(/<script\b[^>]*\bsrc=["'](?!data:)/i)
      expect(selfContained).not.toMatch(/<link\b[^>]*\bhref=["'](?!data:)/i)
      expect(selfContained).toContain('data:font/woff2;base64,')
      expect(selfContained).toContain('data:text/plain;base64,')
      expect(selfContained).not.toContain('assets/fonts/')
      expect(selfContained).toContain('__renderRuntimeSlide')
      const exported = await renderer.exportRendered(result, 'html', example.title)
      const exportedHtml = exported.buffer.toString('utf8')
      expect(exportedHtml).toContain('data-mode="present"')
      expect(exportedHtml).toContain('data-presentation-export="true"')
      expect(exportedHtml).toContain('xpert-presentation-export-style')
      expect(exportedHtml).not.toMatch(/<script\b[^>]*\bsrc=["'](?!data:)/i)
    } finally {
      await renderer.cleanup(result.directory)
    }
  }, 30000)
})
