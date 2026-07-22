import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-canvas-assistant.yaml',
  'dist/lib/remote-components/canvas-workbench/app.js',
  'dist/vendor/design-fonts/index.js',
  'dist/vendor/design-fonts/index.d.ts',
  'dist/sandbox-actions/canvas-export/action.json',
  'dist/sandbox-actions/canvas-export/bundle/runner.mjs',
  'dist/sandbox-actions/canvas-export/bundle/renderer.js',
  'dist/sandbox-actions/canvas-export/bundle/renderer.css',
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

const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))
const pluginManifest = JSON.parse(readFileSync(join(packageRoot, '.xpertai-plugin/plugin.json'), 'utf8'))
const actionManifest = JSON.parse(readFileSync(join(packageRoot, 'dist/sandbox-actions/canvas-export/action.json'), 'utf8'))
if (packageJson.dependencies?.['@xpert-ai/design-fonts']) {
  throw new Error('Canvas must vendor @xpert-ai/design-fonts instead of publishing it as a runtime dependency.')
}
const unresolvedDesignFontImports = listRuntimeFiles(join(packageRoot, 'dist'))
  .filter((file) => readFileSync(file, 'utf8').includes('@xpert-ai/design-fonts'))
if (unresolvedDesignFontImports.length) {
  throw new Error(`Canvas package output still imports @xpert-ai/design-fonts: ${unresolvedDesignFontImports.join(', ')}`)
}
if (pluginManifest.name !== packageJson.name || pluginManifest.version !== packageJson.version) {
  throw new Error('Canvas package and plugin manifest identity/version must match.')
}
if (packageJson.xpert?.plugin?.artifactNamespace !== 'canvas' || pluginManifest.artifactNamespace !== 'canvas') {
  throw new Error('Canvas system Artifact namespace must be declared consistently.')
}
if (pluginManifest.sandboxActions !== './dist/sandbox-actions/canvas-export/action.json') {
  throw new Error('Canvas Sandbox Action manifest path is invalid.')
}
if (actionManifest.name !== 'canvas.export' || actionManifest.version !== '1.0.0' || actionManifest.runtimeProfile !== 'browser/playwright-1.61/v1') {
  throw new Error('Canvas Sandbox Action identity, version, or runtime profile is invalid.')
}

function listRuntimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return listRuntimeFiles(path)
    return /\.(?:js|mjs|d\.ts)$/.test(entry.name) ? [path] : []
  })
}
