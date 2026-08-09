import fsPromises from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import {
  getMinerUPdfPageCount,
  prepareMinerUPdfBatches,
  removeMinerUPdfBatchPlan
} from './pdf-batch.js'

async function createPdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([100, 100])
  const bytes = await pdf.save()
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

describe('MinerU PDF batching', () => {
  it('reads the page count', async () => {
    await expect(getMinerUPdfPageCount(await createPdf(3))).resolves.toBe(3)
  })

  it('splits PDFs into official 200-page batches and cleans temporary files', async () => {
    const plan = await prepareMinerUPdfBatches(await createPdf(401), 'large document.pdf')
    const paths = plan.batches.map((batch) => batch.temporaryPath)

    expect(plan.pageCount).toBe(401)
    expect(plan.batches.map((batch) => batch.pageCount)).toEqual([200, 200, 1])
    expect(plan.batches.map((batch) => [batch.sourcePageStart, batch.sourcePageEnd])).toEqual([
      [1, 200],
      [201, 400],
      [401, 401]
    ])
    await expect(Promise.all(paths.map((filePath) => fsPromises.access(filePath)))).resolves.toBeDefined()

    await removeMinerUPdfBatchPlan(plan)
    await expect(fsPromises.access(plan.temporaryDirectory)).rejects.toBeDefined()
  })

  it('rejects corrupt or encrypted PDF input', async () => {
    await expect(getMinerUPdfPageCount(Buffer.from('not a pdf'))).rejects.toThrow('corrupt or encrypted')
  })
})
