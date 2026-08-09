import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { prepareBaiduPdfBatches, removeBaiduPdfBatchPlan } from './pdf-batch.js'

describe('Baidu PDF batching', () => {
  it('splits by the official per-task page limit and records original page ranges', async () => {
    const source = await PDFDocument.create()
    for (let index = 0; index < 5; index += 1) source.addPage([100, 100])
    const bytes = await source.save()
    const tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'baidu-ocr-test-'))
    try {
      const plan = await prepareBaiduPdfBatches(Buffer.from(bytes), 'sample.pdf', tempRoot, {
        maxPages: 2,
        maxBytes: 1024 * 1024
      })
      expect(plan.pageCount).toBe(5)
      expect(plan.batches.map((batch) => [batch.sourcePageStart, batch.sourcePageEnd])).toEqual([
        [1, 2],
        [3, 4],
        [5, 5]
      ])
      await removeBaiduPdfBatchPlan(plan)
      await expect(fsPromises.stat(plan.temporaryDirectory)).rejects.toThrow()
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true })
    }
  })
})
