import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJsonPath = join(packageRoot, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

const requiredFiles = new Set([
  packageJson.main,
  packageJson.module,
  packageJson.types,
  packageJson.exports?.['.']?.import,
  packageJson.exports?.['.']?.default,
  packageJson.exports?.['.']?.types,
  '.xpertai-plugin/plugin.json',
  'README.md',
  'README_zh-hans.md',
  'assets/logo.svg',
  'dist/lib/excalidraw.plugin.js',
  'dist/lib/excalidraw.service.js',
  'dist/lib/excalidraw-artifact-viewer.service.js',
  'dist/lib/excalidraw.middleware.js',
  'dist/lib/excalidraw-view.provider.js',
  'dist/lib/excalidraw-core.module.js',
  'dist/lib/excalidraw-collaboration.provider.js',
  'dist/lib/excalidraw-yjs.js',
  'dist/lib/entities/excalidraw-artifact-publication.entity.js',
  'dist/lib/diagram-engine/diagram-engine.module.js',
  'dist/lib/diagram-engine/diagram.middleware.js',
  'dist/lib/remote-components/excalidraw-workbench/app.js',
  'dist/lib/artifact-viewer/app.js',
  'dist/lib/artifact-viewer/app.css',
  'dist/xpert-excalidraw-assistant.yaml',
  'dist/xpert-excalidraw-technical-diagram-assistant.yaml',
  'skills/excalidraw-agent-skill/SKILL.md',
  'skills/technical-diagram/SKILL.md',
  'skills/NOTICE.fireworks-tech-graph.txt',
  'assets/diagram-templates/rag-pipeline.svg'
])

const missingFiles = [...requiredFiles]
  .filter((file) => typeof file === 'string' && file.trim().length > 0)
  .map((file) => file.replace(/^\.\//, ''))
  .filter((file) => !existsSync(join(packageRoot, file)))

if (missingFiles.length) {
  console.error(`Missing files required for publishing ${packageJson.name}@${packageJson.version}:`)
  for (const file of missingFiles) {
    console.error(`- ${normalize(file)}`)
  }
  process.exit(1)
}
