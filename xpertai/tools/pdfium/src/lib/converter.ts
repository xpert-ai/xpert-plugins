import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { z } from 'zod'

export const PdfiumOptionsSchema = z.object({
  scale: z.number().finite().positive().default(2),
  timeoutMs: z.number().int().positive().max(1_800_000).default(300_000)
})

export const PdfiumPagesSchema = z
  .array(
    z.object({
      page: z.number().int().positive(),
      text: z.string(),
      imageName: z.string().regex(/^page-[1-9][0-9]*\.png$/)
    })
  )
  .min(1)
export type PdfiumPageResult = z.infer<typeof PdfiumPagesSchema>[number]

/** Own the worker and scratch files until the caller has persisted the resulting assets. */
export async function withPdfiumPages<T>(
  buffer: Buffer,
  options: { scale?: number; timeoutMs?: number; signal?: AbortSignal },
  consume: (pages: PdfiumPageResult[], directory: string) => Promise<T>
): Promise<T> {
  const settings = PdfiumOptionsSchema.parse(options)
  options.signal?.throwIfAborted()
  if (!buffer.length) throw new Error('PDFium source file is empty')
  if (buffer.length > 100 * 1024 * 1024) throw new Error('PDFium accepts source files up to 100 MB')
  const directory = await mkdtemp(join(tmpdir(), 'xpert-pdfium-'))
  let worker: Worker | undefined
  try {
    const data = Uint8Array.from(buffer)
    worker = new Worker(new URL('./pdfium.worker.js', import.meta.url), {
      workerData: { data, directory, scale: settings.scale },
      transferList: [data.buffer]
    })
    const currentWorker = worker
    const pages = await new Promise<PdfiumPageResult[]>((resolve, reject) => {
      const cancel = () => reject(new Error('PDFium conversion cancelled'))
      const timeout = setTimeout(
        () => reject(new Error(`PDFium conversion exceeded its ${settings.timeoutMs} ms timeout`)),
        settings.timeoutMs
      )
      const cleanup = () => {
        clearTimeout(timeout)
        options.signal?.removeEventListener('abort', cancel)
      }
      options.signal?.addEventListener('abort', cancel, { once: true })
      currentWorker.once('message', (message: z.input<typeof PdfiumPagesSchema>) => {
        cleanup()
        const parsed = PdfiumPagesSchema.safeParse(message)
        if (parsed.success) resolve(parsed.data)
        else reject(new Error('PDFium returned an invalid page manifest'))
      })
      currentWorker.once('error', (error) => {
        cleanup()
        reject(error)
      })
      currentWorker.once('exit', (code) => {
        cleanup()
        reject(new Error(`PDFium exited before returning pages (code ${code})`))
      })
      if (options.signal?.aborted) cancel()
    })
    await worker.terminate()
    options.signal?.throwIfAborted()
    return await consume(pages, directory)
  } finally {
    await worker?.terminate()
    await rm(directory, { recursive: true, force: true })
  }
}
