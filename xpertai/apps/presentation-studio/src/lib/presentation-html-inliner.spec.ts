import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inlinePresentationHtml, inlinePresentationPreviewHtml } from './presentation-html-inliner.js'

describe('self-contained HTML inliner', () => {
  it('inlines scripts, styles, and binary assets without local references', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-inline-test-'))
    try {
      await mkdir(join(root, 'assets'))
      await writeFile(join(root, 'assets', 'pixel.png'), Buffer.from([137, 80, 78, 71]))
      await writeFile(join(root, 'assets', 'app.css'), '.hero{background:url("pixel.png")}')
      await writeFile(join(root, 'assets', 'app.js'), 'window.__asset="assets/pixel.png"')
      await writeFile(join(root, 'index.html'), '<html><head><link rel="stylesheet" href="assets/app.css"></head><body><img src="assets/pixel.png"><script src="assets/app.js"></script></body></html>')
      const html = await inlinePresentationHtml(root, 1024 * 1024)
      expect(html).toContain('<style>')
      expect(html).toContain('data:image/png;base64,')
      expect(html).not.toContain('src="assets/')
      expect(html).not.toContain('href="assets/')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('inlines managed font files and their license link', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-inline-font-'))
    try {
      await mkdir(join(root, 'assets', 'fonts'), { recursive: true })
      await writeFile(join(root, 'assets', 'fonts', 'inter.woff2'), Buffer.from('font-binary'))
      await writeFile(join(root, 'assets', 'fonts', 'font-pack.css'), '@font-face{font-family:Inter;src:url("./inter.woff2") format("woff2")}')
      await writeFile(join(root, 'assets', 'fonts', 'FONT-LICENSES.txt'), 'SIL Open Font License 1.1')
      await writeFile(
        join(root, 'index.html'),
        '<html><head><link rel="stylesheet" href="assets/fonts/font-pack.css"><link rel="license" href="assets/fonts/FONT-LICENSES.txt"></head></html>',
      )

      const html = await inlinePresentationHtml(root)

      expect(html).toContain('data:font/woff2;base64,')
      expect(html).toContain('data:text/plain;base64,')
      expect(html).not.toContain('assets/fonts/')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects previews over the configured limit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-inline-limit-'))
    try {
      await writeFile(join(root, 'index.html'), '<html><body>too large</body></html>')
      await expect(inlinePresentationPreviewHtml(root, 4)).rejects.toThrow('configured')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('replaces oversized user media in previews without changing full HTML export', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-inline-media-'))
    try {
      await mkdir(join(root, 'assets', 'user-media'), { recursive: true })
      await writeFile(join(root, 'assets', 'user-media', 'large.png'), Buffer.alloc(2048, 1))
      await writeFile(join(root, 'index.html'), '<html><body><img src="assets/user-media/large.png"></body></html>')
      const preview = await inlinePresentationPreviewHtml(root, 1024)
      expect(preview).toContain('data:image/svg+xml;base64,')
      expect(preview).toContain('exports use original media')
      const exported = await inlinePresentationHtml(root)
      expect(exported).toContain(Buffer.alloc(2048, 1).toString('base64'))
      expect(exported).not.toContain('exports use original media')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
