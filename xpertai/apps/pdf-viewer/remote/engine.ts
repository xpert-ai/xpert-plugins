import { z } from 'zod'
import { getDocument, PDFWorker } from 'pdfjs-dist'
import workerSource from 'virtual:pdf-worker'
import { action } from './bridge'

export const decode = (base64: string) => Uint8Array.from(atob(base64), char => char.charCodeAt(0))
/** Public, packaged PDF.js assets are requested by exact kind/name, never arbitrary URLs. */
class PackagedBinaryDataFactory {
  async fetch(input: unknown) {
    const { kind, filename } = z.object({ kind: z.enum(['cMapUrl', 'standardFontDataUrl', 'wasmUrl']),
      filename: z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/).max(120) }).parse(input)
    const folder = { cMapUrl: 'cmaps', standardFontDataUrl: 'standard_fonts', wasmUrl: 'wasm' }[kind]
    const result = z.object({ contentBase64: z.string() }).parse(await action('viewer.asset', { name: `${folder}/${filename}` }))
    return decode(result.contentBase64)
  }
}
export function openPdf(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const port = new Worker(url)
  const worker = PDFWorker.create({ port })
  const task = getDocument({ data: bytes, worker, useWorkerFetch: false,
    BinaryDataFactory: PackagedBinaryDataFactory, enableXfa: false,
    maxImageSize: 32 * 1024 * 1024, canvasMaxAreaInBytes: 64 * 1024 * 1024,
    useSystemFonts: false, stopAtErrors: true })
  let timer: ReturnType<typeof setTimeout>
  const failed = new Promise<never>((_, reject) => {
    port.addEventListener('error', () => reject(new Error('pdf.worker_failed')), { once: true })
    timer = setTimeout(() => reject(new Error('pdf.loading_timeout')), 30000)
  })
  const promise = Promise.race([task.promise, failed]).finally(() => clearTimeout(timer))
  return { task, promise, awaitPassword: () => clearTimeout(timer), destroy: async () => {
    clearTimeout(timer); void task.destroy().catch(() => {})
    worker.destroy(); port.terminate(); URL.revokeObjectURL(url)
  } }
}
