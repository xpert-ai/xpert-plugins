import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const packageRequire = createRequire(join(packageRoot, 'package.json'))
const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/xpert-pencil-assistant.yaml',
  'dist/lib/remote-components/pencil-workbench/app.js',
  'dist/lib/remote-components/pencil-workbench/app.css',
  '.xpertai-plugin/plugin.json',
  'assets/logo.svg',
  'assets/composerIcon.svg',
  'assets/font-licenses/NotoSansSC-OFL.txt',
  'skills/pencil-agent-skill/SKILL.md',
  'README.md'
]

const missing = requiredFiles.filter((file) => !existsSync(join(packageRoot, file)))
if (missing.length) {
  console.error(`Pencil plugin package output is missing: ${missing.join(', ')}`)
  process.exit(1)
}

const remoteAppScript = readFileSync(join(packageRoot, 'dist/lib/remote-components/pencil-workbench/app.js'), 'utf8')
if (!remoteAppScript.includes('Pencil CJK')) {
  console.error('Pencil Workbench bundle is missing its deterministic CJK font fallback.')
  process.exit(1)
}
if (/assets\/[A-Za-z0-9._-]+\.(?:js|wasm|woff2?|ttf)/u.test(remoteAppScript)) {
  console.error('Pencil Workbench bundle references an external asset that the remote iframe cannot load.')
  process.exit(1)
}

const pencilPackageScope = ['@open', 'pencil'].join('-')
const pencilCorePackageName = `${pencilPackageScope}/core`
const pencilVuePackageName = `${pencilPackageScope}/vue`
const runtimeDependencies = [
  pencilCorePackageName,
  `${pencilCorePackageName}/scene-graph`,
  `${pencilCorePackageName}/tools`,
  pencilVuePackageName,
  'canvaskit-wasm',
  'vue'
]

const missingRuntimeDependencies = runtimeDependencies.filter((dependency) => {
  try {
    packageRequire.resolve(dependency)
    return false
  } catch {
    return true
  }
})

if (missingRuntimeDependencies.length) {
  console.error(
    `Pencil plugin runtime dependencies are missing: ${missingRuntimeDependencies.join(', ')}`
  )
  console.error('Run the package install step before packaging, and keep these packages in dependencies.')
  process.exit(1)
}

try {
  require(join(packageRoot, 'dist/index.js'))
} catch (error) {
  console.error('Pencil plugin dist/index.js must stay loadable through CJS require for the Xpert plugin loader.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
