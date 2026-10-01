import { createRequire } from 'node:module'
import path from 'node:path'
import { asset, fail, finish, OUTPUT_LIMIT } from './result.mjs'

/** AnyDoc rejects a whole mixed PDF. Isolate pages so its native text extraction is retained. */
export async function convertPdfPages(bytes, api) {
  const root = process.env.XPERT_SANDBOX_DOCUMENT_DEPENDENCY_ROOT
  if (!root || !path.isAbsolute(root)) fail('RUNTIME_INVALID')
  let PDFDocument, PDFiumLibrary, PNG
  try {
    const require = createRequire(path.join(root, 'package.json'))
    ;({ PDFDocument } = require('pdf-lib'))
    ;({ PDFiumLibrary } = require('@hyzyla/pdfium'))
    ;({ PNG } = require('pngjs'))
  } catch {
    fail('RUNTIME_INVALID')
  }
  const source = await PDFDocument.load(bytes)
  const count = source.getPageCount()
  if (count < 1 || count > 500) fail('RESOURCE_LIMIT')
  const pdfium = await PDFiumLibrary.init()
  try {
    const pdf = await pdfium.loadDocument(Uint8Array.from(bytes))
    try {
      if (pdf.getPageCount() !== count) fail('INCOMPLETE_PAGES')
      const pages = []
      const assets = []
      let size = 0
      for (let index = 0; index < count; index++) {
        const pageNumber = index + 1
        const single = await PDFDocument.create()
        const [copied] = await single.copyPages(source, [index])
        single.addPage(copied)
        let markdown
        try {
          markdown = await api.toMarkdownBytes(await single.save(), api.formatFromExtension('pdf'), { ocr: 'reject' })
        } catch (error) {
          if (error?.code !== 'needsOcr') throw error
        }
        if (markdown?.trim()) {
          pages.push({ page: pageNumber, markdown, status: 'text' })
          size += Buffer.byteLength(markdown)
        } else {
          const page = pdf.getPage(index)
          const dimensions = page.getSize()
          if (![dimensions.width, dimensions.height].every((n) => Number.isFinite(n) && n > 0))
            fail('INVALID_DOCUMENT')
          const scale = Math.min(2, 2200 / Math.max(dimensions.width, dimensions.height))
          const bitmap = await page.render({ scale, render: 'bitmap' })
          const png = new PNG({ width: bitmap.width, height: bitmap.height })
          png.data = Buffer.from(bitmap.data)
          const image = asset(`page-${pageNumber}.png`, 'image/png', PNG.sync.write(png), pageNumber)
          assets.push({ ...image, sourceType: 'pdf_page' })
          size += image.size
          pages.push({ page: pageNumber, status: 'needs-ocr', markdown: `![Page ${pageNumber}](xpert-asset://${image.name})` })
        }
        if (size > OUTPUT_LIMIT) fail('OUTPUT_TOO_LARGE')
      }
      return finish({ markdown: pages.map((page) => page.markdown).join('\n\n'), pages, assets })
    } finally {
      pdf.destroy()
    }
  } finally {
    pdfium.destroy()
  }
}
