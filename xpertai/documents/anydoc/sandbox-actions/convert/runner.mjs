import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { convert } from './convert.mjs'
const argument = (name) => {
  const index = process.argv.indexOf(name)
  if (index < 0 || !process.argv[index + 1]) throw new Error('Invalid Action arguments')
  return path.resolve(process.argv[index + 1])
}
try {
  const requestPath = argument('--request'),
    output = argument('--output')
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  if (request.contractVersion !== '1' || request.action !== 'anydoc.convert' || request.actionVersion !== '1.0.3')
    throw new Error('Invalid Action contract')
  await mkdir(output, { recursive: true })
  let result
  try {
    result = await convert(path.join(path.dirname(requestPath), 'source.bin'), request.payload?.extension, output)
  } catch (error) {
    const codes = [
      'EMPTY_FILE',
      'EMPTY_TEXT',
      'INPUT_TOO_LARGE',
      'OUTPUT_TOO_LARGE',
      'INVALID_DOCUMENT',
      'ENCRYPTED',
      'UNSUPPORTED_FORMAT',
      'UNSUPPORTED_ENCODING',
      'NEEDS_OCR',
      'INCOMPLETE_PAGES',
      'RESOURCE_LIMIT',
      'RUNTIME_INVALID'
    ]
    result = {
      ok: false,
      code: codes.includes(error?.code) ? error.code : 'INVALID_DOCUMENT',
      ...(Array.isArray(error?.pages)
        ? { pages: error.pages.filter((n) => Number.isSafeInteger(n) && n > 0 && n <= 10000).slice(0, 100) }
        : {})
    }
  }
  await writeFile(path.join(output, 'result.json'), JSON.stringify(result))
  if (!result.ok) {
    // Core must persist a failed Job so a later attempt can run after recovery.
    process.stderr.write(`ANYDOC_CONVERSION_ERROR: ${JSON.stringify(result)}\n`)
    process.exitCode = 1
  }
} catch {
  process.stderr.write('EXPORT_OUTPUT_INVALID: Document conversion Action failed.\n')
  process.exitCode = 1
}
