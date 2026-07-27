import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rewritePresentationFontPackForOnline } from './presentation-renderer.service.js'

describe('Presentation managed online font source', () => {
  it('rewrites only manifest-approved Fontsource files to pinned HTTPS URLs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'presentation-online-font-test-'))
    const fontRoot = join(root, 'assets', 'fonts')
    await mkdir(fontRoot, { recursive: true })
    await writeFile(join(fontRoot, 'font-pack.json'), JSON.stringify({
      packages: [{ name: '@fontsource/inter', version: '5.2.8' }]
    }))
    await writeFile(join(fontRoot, 'font-pack.css'), "src: url('./inter/inter-latin-400-normal.woff2') format('woff2');")

    try {
      await rewritePresentationFontPackForOnline(root)
      expect(await readFile(join(fontRoot, 'font-pack.css'), 'utf8')).toContain(
        "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.2.8/files/inter-latin-400-normal.woff2"
      )
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
