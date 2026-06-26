import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-canvas-assistant.yaml',
  'dist/lib/remote-components/canvas-workbench/app.js',
  '.xpertai-plugin/plugin.json',
  'assets/logo.svg',
  'assets/composerIcon.svg',
  'skills/canvas-agent-skill/SKILL.md',
  'README.md'
]

const missing = requiredFiles.filter((file) => !existsSync(join(packageRoot, file)))
if (missing.length) {
  console.error(`Canvas plugin package output is missing: ${missing.join(', ')}`)
  process.exit(1)
}
