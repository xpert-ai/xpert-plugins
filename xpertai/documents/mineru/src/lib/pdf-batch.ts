import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

export const MINERU_MAX_FILE_BYTES = 200_000_000
export const MINERU_MAX_PDF_PAGES = 200
// Leave a small margin below the documented 200 MB server limit.
export const MINERU_PDF_BATCH_TARGET_BYTES = 190 * 1024 * 1024

export type MinerUPdfBatch = {
  batchIndex: number
  sourcePageStart: number
  sourcePageEnd: number
  pageCount: number
  byteLength: number
  fileName: string
  temporaryPath: string
}

export type MinerUPdfBatchPlan = {
  pageCount: number
  temporaryDirectory: string
  batches: MinerUPdfBatch[]
}

export async function getMinerUPdfPageCount(buffer: Buffer): Promise<number> {
  const document = await loadPdf(buffer)
  const pageCount = document.getPageCount()
  if (!pageCount) throw new Error('MinerU cannot parse a PDF without pages')
  return pageCount
}

export async function prepareMinerUPdfBatches(
  buffer: Buffer,
  originalFileName: string,
  tempDir?: string
): Promise<MinerUPdfBatchPlan> {
  const temporaryRoot = tempDir?.trim() || os.tmpdir()
  await fsPromises.mkdir(temporaryRoot, { recursive: true })
  const temporaryDirectory = await fsPromises.mkdtemp(path.join(temporaryRoot, 'mineru-pdf-'))

  try {
    const source = await loadPdf(buffer)
    const pageCount = source.getPageCount()
    if (!pageCount) throw new Error('MinerU cannot split a PDF without pages')

    const batches: MinerUPdfBatch[] = []
    let sourcePageStart = 1
    while (sourcePageStart <= pageCount) {
      const maximumPageCount = Math.min(MINERU_MAX_PDF_PAGES, pageCount - sourcePageStart + 1)
      const part = await createLargestFittingPart(
        source,
        sourcePageStart,
        maximumPageCount,
        MINERU_PDF_BATCH_TARGET_BYTES
      )
      const batchIndex = batches.length
      const sourcePageEnd = sourcePageStart + part.pageCount - 1
      const fileName = batchFileName(originalFileName, batchIndex, sourcePageStart, sourcePageEnd)
      const temporaryPath = path.join(temporaryDirectory, fileName)
      await fsPromises.writeFile(temporaryPath, part.buffer)
      batches.push({
        batchIndex,
        sourcePageStart,
        sourcePageEnd,
        pageCount: part.pageCount,
        byteLength: part.buffer.length,
        fileName,
        temporaryPath
      })
      sourcePageStart = sourcePageEnd + 1
    }

    return { pageCount, temporaryDirectory, batches }
  } catch (error) {
    await fsPromises.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    throw error
  }
}

export async function removeMinerUPdfBatchPlan(plan: MinerUPdfBatchPlan): Promise<void> {
  await fsPromises.rm(plan.temporaryDirectory, { recursive: true, force: true })
}

async function createLargestFittingPart(
  source: PDFDocument,
  sourcePageStart: number,
  maximumPageCount: number,
  maxBytes: number
): Promise<{ buffer: Buffer; pageCount: number }> {
  const maximum = await createPdfPart(source, sourcePageStart, maximumPageCount)
  if (maximum.length <= maxBytes) return { buffer: maximum, pageCount: maximumPageCount }

  let low = 1
  let high = maximumPageCount - 1
  let best: { buffer: Buffer; pageCount: number } | undefined
  while (low <= high) {
    const candidatePageCount = Math.floor((low + high) / 2)
    const candidate = await createPdfPart(source, sourcePageStart, candidatePageCount)
    if (candidate.length <= maxBytes) {
      best = { buffer: candidate, pageCount: candidatePageCount }
      low = candidatePageCount + 1
    } else {
      high = candidatePageCount - 1
    }
  }
  if (best) return best
  throw new Error(
    `MinerU PDF source page ${sourcePageStart} cannot fit within the ${formatMiB(maxBytes)} MiB upload limit`
  )
}

async function createPdfPart(source: PDFDocument, sourcePageStart: number, pageCount: number): Promise<Buffer> {
  const output = await PDFDocument.create()
  const pageIndices = Array.from({ length: pageCount }, (_, index) => sourcePageStart - 1 + index)
  const pages = await output.copyPages(source, pageIndices)
  pages.forEach((page) => output.addPage(page))
  const bytes = await output.save()
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

async function loadPdf(buffer: Buffer): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(buffer)
  } catch {
    throw new Error('MinerU cannot inspect or split the PDF because it is corrupt or encrypted')
  }
}

function batchFileName(
  originalFileName: string,
  batchIndex: number,
  sourcePageStart: number,
  sourcePageEnd: number
): string {
  const baseName = path.basename(originalFileName, path.extname(originalFileName))
  const safeBaseName = baseName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || 'document'
  return `${safeBaseName}.part-${String(batchIndex + 1).padStart(4, '0')}.pages-${padPage(sourcePageStart)}-${padPage(sourcePageEnd)}.pdf`
}

function padPage(pageNumber: number): string {
  return String(pageNumber).padStart(4, '0')
}

function formatMiB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}
