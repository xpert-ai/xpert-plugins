import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
const execute = promisify(execFile)
const runner = new URL('../dist/sandbox-actions/convert/bundle/runner.mjs', import.meta.url)
export async function convert(source, extension) {
  const root = await mkdtemp(path.join(tmpdir(), 'markitdown-action-'))
  try {
    await writeFile(path.join(root, 'source.bin'), source)
    await writeFile(
      path.join(root, 'job.json'),
      JSON.stringify({
        contractVersion: '1',
        action: 'markitdown.convert',
        actionVersion: '1.1.0',
        payload: { extension }
      })
    )
    await execute(process.execPath, [
      runner.pathname,
      '--request',
      path.join(root, 'job.json'),
      '--output',
      path.join(root, 'output')
    ])
    return JSON.parse(await readFile(path.join(root, 'output/result.json'), 'utf8'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}


export function imagePdf(stream) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /ASCIIHexDecode /Length 7 >>\nstream\nff0000>\nendstream'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 7\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return pdf
}
