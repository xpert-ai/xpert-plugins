import assert from 'node:assert/strict'
import { test } from 'node:test'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { withPdfiumPages } from '../dist/lib/converter.js'

function pdfFixture() {
  const stream = 'BT /F1 18 Tf 20 150 Td (PDFium test) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>'
  ]
  let data = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(data))
    data += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(data)
  data += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  data += offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')
  data += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(data)
}

test('native text is read before render closes the page, and blank pages retain images', async () => {
  let used
  await withPdfiumPages(pdfFixture(), { scale: 1 }, async (pages, directory) => {
    used = directory
    assert.equal(pages.length, 2)
    assert.equal(pages[0].text, 'PDFium test')
    assert.equal(pages[1].text, '')
    for (const page of pages) {
      const image = PNG.sync.read(await readFile(join(directory, page.imageName)))
      assert.equal(image.width, 200)
      assert.equal(image.height, 200)
    }
  })
  await assert.rejects(() => access(used))
})
test('scratch is removed if the asset consumer fails', async () => {
  let used
  await assert.rejects(
    () =>
      withPdfiumPages(pdfFixture(), {}, async (_pages, directory) => {
        used = directory
        throw new Error('storage unavailable')
      }),
    /storage unavailable/
  )
  await assert.rejects(() => access(used))
})
test('corrupt input rejects', async () => {
  await assert.rejects(() => withPdfiumPages(Buffer.from('corrupt'), {}, async () => assert.fail()))
})
test('timeout terminates the worker before invoking the asset consumer', async () => {
  await assert.rejects(() => withPdfiumPages(pdfFixture(), { timeoutMs: 1 }, async () => assert.fail()), /timeout/)
})
test('running cancellation terminates the worker', async () => {
  const controller = new AbortController()
  const result = withPdfiumPages(pdfFixture(), { signal: controller.signal }, async () => assert.fail())
  setTimeout(() => controller.abort(), 5)
  await assert.rejects(() => result, /cancel/)
})
