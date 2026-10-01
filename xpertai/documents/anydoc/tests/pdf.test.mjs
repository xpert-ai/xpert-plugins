import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { convert } from '../sandbox-actions/convert/convert.mjs'

const root = process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
const managed = root ? createRequire(path.join(root, 'package.json')) : undefined

for (const mixed of [false, true]) {
  test(`managed Runtime renders ${mixed ? 'mixed' : 'scan-only'} PDF pages for platform image understanding`,
    { skip: !root }, async (t) => {
      const { PDFDocument } = managed('pdf-lib')
      const { PNG } = managed('pngjs')
      const api = managed('@firecrawl/anydoc')
      const pdf = await PDFDocument.create()
      if (mixed) pdf.addPage().drawText('NATIVE-FIRST-471')
      const png = new PNG({ width: 30, height: 30 })
      png.data.fill(0xff)
      // Visible bitmap content without a text layer.
      for (let i = 0; i < 30 * 30; i += 2) png.data[i * 4] = 0
      const image = await pdf.embedPng(PNG.sync.write(png))
      pdf.addPage().drawImage(image, { x: 10, y: 10, width: 200, height: 200 })
      if (mixed) pdf.addPage().drawText('NATIVE-LAST-862')
      const dir = await mkdtemp(path.join(tmpdir(), 'anydoc-pdf-'))
      t.after(() => rm(dir, { recursive: true, force: true }))
      const file = path.join(dir, 'test.pdf')
      await writeFile(file, await pdf.save())
      const result = await convert(file, 'pdf', dir)
      assert.equal(result.pages.length, mixed ? 3 : 1)
      assert.deepEqual(result.pages.map((page) => page.status), mixed ? ['text', 'needs-ocr', 'text'] : ['needs-ocr'])
      assert.equal(result.assets.length, 1)
      assert.equal(result.assets[0].sourceType, 'pdf_page')
      assert.equal(result.assets[0].page, mixed ? 2 : 1)
      const rendered = PNG.sync.read(Buffer.from(result.assets[0].data, 'base64'))
      assert.ok(rendered.width > 100 && rendered.height > 100)
      assert.ok(Math.max(rendered.width, rendered.height) <= 2200)
      if (mixed) {
        assert.match(result.pages[0].markdown, /NATIVE-FIRST-471/)
        assert.match(result.pages[2].markdown, /NATIVE-LAST-862/)
        // Native text is still produced by AnyDoc after page isolation.
        const first = await PDFDocument.create()
        first.addPage((await first.copyPages(pdf, [0]))[0])
        assert.equal(result.pages[0].markdown, await api.toMarkdownBytes(await first.save(), 'pdf', { ocr: 'reject' }))
      }
    })
}

test('a missing page renderer is reported as a Runtime dependency error', async () => {
  const previous = process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
  delete process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
  const dir = await mkdtemp(path.join(tmpdir(), 'anydoc-missing-pdf-'))
  try {
    const file = path.join(dir, 'test.pdf')
    await writeFile(file, '%PDF-1.4')
    await assert.rejects(convert(file, 'pdf', dir, {
      formatFromBytes: () => 'pdf', formatFromExtension: () => 'pdf',
      toMarkdownBytes: async (_, __, options) => {
        assert.equal(options.ocr, 'reject')
        throw Object.assign(new Error('scan'), { code: 'needsOcr' })
      }
    }), (error) => error.code === 'RUNTIME_INVALID')
  } finally {
    if (previous === undefined) delete process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
    else process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT = previous
    await rm(dir, { recursive: true, force: true })
  }
})
