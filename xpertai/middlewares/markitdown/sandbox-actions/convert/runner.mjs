import { execFile } from 'node:child_process'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

try {
  const argument = (name) => {
    const index = process.argv.indexOf(name)
    if (index < 0 || !process.argv[index + 1]) throw new Error('EXPORT_INPUT_INVALID: Missing Action argument.')
    return path.resolve(process.argv[index + 1])
  }
  const requestPath = argument('--request')
  const output = argument('--output')
  const request = JSON.parse(await readFile(requestPath, 'utf8'))
  if (request.contractVersion !== '1' || request.action !== 'markitdown.convert' || request.actionVersion !== '1.1.0') {
    throw new Error('EXPORT_INPUT_INVALID: Invalid MarkItDown Action contract.')
  }
  const extension = request.payload?.extension
  if (!['pdf', 'docx', 'pptx', 'html', 'htm', 'txt', 'md', 'markdown'].includes(extension)) {
    throw new Error('EXPORT_INPUT_INVALID: Unsupported document format.')
  }
  await mkdir(output, { recursive: true })
  // This child runs only inside the platform Runtime, whose PATH is owned by its Provider.
  await promisify(execFile)(
    'python3',
    [
      '-I',
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'convert.py'),
      path.join(path.dirname(requestPath), 'source.bin'),
      path.join(output, 'result.json'),
      extension === 'markdown' ? 'md' : extension
    ],
    { timeout: 300000, maxBuffer: 256 * 1024 }
  )
} catch (error) {
  const message =
    error instanceof Error && error.message.startsWith('EXPORT_INPUT_INVALID:')
      ? error.message
      : typeof error?.stderr === 'string' && /^EXPORT_(?:INPUT|OUTPUT)_INVALID: [A-Za-z0-9 ._-]+\s*$/.test(error.stderr)
        ? error.stderr.trim()
        : 'EXPORT_OUTPUT_INVALID: MarkItDown conversion failed.'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
