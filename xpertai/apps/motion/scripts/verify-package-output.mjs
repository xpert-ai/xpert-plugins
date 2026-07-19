import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-motion-assistant.yaml',
  'dist/lib/remote-components/motion-workbench/app.js',
  'dist/lib/remote-components/motion-workbench/app.css',
  'dist/sandbox-actions/hyperframes-render/action.json',
  'dist/assets/upstream/MOTION-SPEC.md',
  '.xpertai-plugin/plugin.json',
  'assets/logo.svg',
  'assets/composerIcon.svg',
  'skills/motion-agent-skill/SKILL.md',
  'README.md'
]

const missing = requiredFiles.filter((file) => !existsSync(join(packageRoot, file)))
if (missing.length) {
  console.error(`Motion plugin package output is missing: ${missing.join(', ')}`)
  process.exit(1)
}
