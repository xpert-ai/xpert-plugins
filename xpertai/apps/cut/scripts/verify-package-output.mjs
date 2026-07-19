import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const execFileAsync = promisify(execFile)
const maxUnpackedBytes = 50 * 1024 * 1024
const maxPackedBytes = 25 * 1024 * 1024
const required = [
  'dist/index.js', 'dist/index.d.ts', 'dist/mcp-server.js', 'dist/mcp-server.d.ts', 'dist/xpert-cut-assistant.yaml',
  'dist/lib/remote-components/cut-workbench/app.js', 'dist/lib/remote-components/cut-workbench/app.css',
  'dist/sandbox-actions/cut-render/action.json', 'dist/sandbox-actions/cut-render/bundle/runner.mjs',
  'dist/sandbox-actions/cut-render/bundle/browser-entry.js',
  'dist/sandbox-actions/cut-transcription-audio/action.json', 'dist/sandbox-actions/cut-transcription-audio/bundle/runner.mjs',
  'dist/sandbox-actions/cut-transcription-audio/bundle/browser-entry.js',
  'dist/sandbox-actions/cut-transcription-whisper/action.json', 'dist/sandbox-actions/cut-transcription-whisper/bundle/runner.mjs',
  'dist/sandbox-actions/cut-transcription-whisper/bundle/browser-entry.js',
  'dist/assets/upstream/LICENSE', 'dist/assets/upstream/ATTRIBUTION.md',
  '.xpertai-plugin/plugin.json', 'assets/logo.svg', 'assets/composerIcon.svg', 'skills/cut-agent-skill/SKILL.md',
  'docs/EDITOR-API-ROADMAP.md', 'docs/GATE-VERIFICATION.md', 'README.md'
]
const missing = required.filter((file) => !existsSync(join(root, file)))
if (missing.length) { console.error(`Cut plugin package output is missing: ${missing.join(', ')}`); process.exit(1) }

const outputFiles = await collectFiles(join(root, 'dist'))
const forbiddenAsset = outputFiles.find(({ path }) => path.endsWith('.onnx') || path.endsWith('.wasm') || path.split('/').includes('models'))
if (forbiddenAsset) throw new Error(`Cut npm output contains a Runtime-owned AI asset: dist/${forbiddenAsset.path}`)
for (const file of outputFiles) {
  if (!/\.(?:c?js|mjs|json|html|css)$/i.test(file.path)) continue
  const content = await readFile(join(root, 'dist', file.path), 'utf8')
  if (/data:(?:application\/wasm|text\/javascript);base64,/i.test(content)) {
    throw new Error(`Cut npm output contains an embedded WASM data URL: dist/${file.path}`)
  }
}

const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: root,
  maxBuffer: 4 * 1024 * 1024
})
const metadata = parsePackMetadata(stdout)
if (metadata.unpackedSize > maxUnpackedBytes) {
  throw new Error(`Cut npm unpacked size ${metadata.unpackedSize} exceeds ${maxUnpackedBytes} bytes.`)
}
if (metadata.size > maxPackedBytes) {
  throw new Error(`Cut npm packed size ${metadata.size} exceeds ${maxPackedBytes} bytes.`)
}
process.stdout.write(`${JSON.stringify({ package: metadata.name, version: metadata.version, packedBytes: metadata.size, unpackedBytes: metadata.unpackedSize })}\n`)

async function collectFiles(directory) {
  const result = []
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name)
      const details = await lstat(absolute)
      if (details.isSymbolicLink()) throw new Error(`Cut npm output contains a symlink: ${relative(root, absolute)}`)
      if (details.isDirectory()) await visit(absolute)
      else if (details.isFile()) result.push({ path: relative(directory, absolute).split('\\').join('/'), size: details.size })
      else throw new Error(`Cut npm output contains a non-regular entry: ${relative(root, absolute)}`)
    }
  }
  await visit(directory)
  return result
}

function parsePackMetadata(output) {
  const start = output.indexOf('[')
  const end = output.lastIndexOf(']')
  if (start < 0 || end <= start) throw new Error('Unable to parse npm pack size metadata.')
  const value = JSON.parse(output.slice(start, end + 1))?.[0]
  if (!value || typeof value.name !== 'string' || typeof value.version !== 'string' || !Number.isFinite(value.size) || !Number.isFinite(value.unpackedSize)) {
    throw new Error('npm pack returned incomplete size metadata.')
  }
  return value
}
