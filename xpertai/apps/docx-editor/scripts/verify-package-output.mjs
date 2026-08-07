import { execFile } from 'node:child_process'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const execFileAsync = promisify(execFile)
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-docx-editor-assistant.yaml',
  'dist/lib/remote-components/docx-editor-workbench/app.js',
  'dist/lib/remote-components/docx-editor-workbench/app.css',
  '.xpertai-plugin/plugin.json',
  'skills/docx-editor/SKILL.md'
]

for (const file of requiredFiles) {
  await access(join(packageRoot, file))
}

// Inspect the archive users install; a valid dist directory alone does not
// guarantee npm's immutable packing rules included every runtime asset.
const packRoot = await mkdtemp(join(tmpdir(), 'docx-editor-pack-'))
try {
  const { stdout } = await execFileAsync(
    'npm',
    ['pack', '--ignore-scripts', '--json', '--pack-destination', packRoot],
    { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024 }
  )
  const packs = JSON.parse(stdout)
  const filename = Array.isArray(packs) && typeof packs[0]?.filename === 'string' ? packs[0].filename : null
  if (!filename) throw new Error('npm pack did not return a package filename.')

  await execFileAsync('tar', ['-xzf', join(packRoot, filename), '-C', packRoot])
  for (const file of requiredFiles) {
    await access(join(packRoot, 'package', file))
  }
} finally {
  await rm(packRoot, { recursive: true, force: true })
}

console.log('DOCX Editor package output verified.')
