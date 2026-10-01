import { PDFiumLibrary } from '@hyzyla/pdfium'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { PNG } from 'pngjs'
import { z } from 'zod'

const input = z
  .object({ data: z.instanceof(Uint8Array), directory: z.string(), scale: z.number().finite().positive() })
  .parse(workerData)
const pdfium = await PDFiumLibrary.init()
try {
  const pdf = await pdfium.loadDocument(input.data)
  try {
    const count = pdf.getPageCount()
    if (count < 1 || count > 500) throw new Error('PDFium accepts PDFs containing 1 to 500 pages')
    const pages: { page: number; text: string; imageName: string }[] = []
    for (let index = 0; index < count; index++) {
      const page = pdf.getPage(index)
      const size = page.getSize()
      // PDFium's render() closes the native page handle. Read its text before rendering.
      const text = page.getText()?.trim() ?? ''
      // Bound render memory for unusually large source pages while retaining their text layer.
      const scale = Math.min(input.scale, 4096 / Math.max(size.width, size.height))
      const bitmap = await page.render({ scale, render: 'bitmap' })
      const png = new PNG({ width: bitmap.width, height: bitmap.height })
      png.data = Buffer.from(bitmap.data)
      const imageName = `page-${index + 1}.png`
      await writeFile(join(input.directory, imageName), PNG.sync.write(png))
      pages.push({ page: index + 1, text, imageName })
    }
    parentPort?.postMessage(pages)
  } finally {
    pdf.destroy()
  }
} finally {
  pdfium.destroy()
}
