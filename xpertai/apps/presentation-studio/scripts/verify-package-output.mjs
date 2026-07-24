import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const execFileAsync = promisify(execFile)
for (const file of [
  'dist/index.js', 'dist/index.d.ts',
  'dist/lib/remote-components/presentation-studio-workbench/app.js',
  'dist/lib/remote-components/presentation-studio-workbench/app.css',
  'dist/xpert-presentation-studio-assistant.yaml',
  'dist/sandbox-actions/presentation-export/action.json',
  'dist/sandbox-actions/presentation-export/bundle/runner.mjs',
  'dist/sandbox-actions/presentation-export/bundle/project/layout-manifest.json',
  'assets/upstream/UPSTREAM.json',
  '.xpertai-plugin/plugin.json'
]) await access(join(root, file))

const themePreviewFilenames = await readdir(join(root, 'assets', 'theme-previews'))
for (let index = 1; index <= 14; index += 1) {
  const themeKey = `theme${String(index).padStart(2, '0')}`
  if (themePreviewFilenames.filter((filename) => filename.startsWith(`${themeKey}-`) && filename.endsWith('.png')).length !== 1) {
    throw new Error(`Expected exactly one packaged preview image for ${themeKey}.`)
  }
}

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const remoteApp = await readFile(join(root, 'dist/lib/remote-components/presentation-studio-workbench/app.js'), 'utf8')
const expectedReactVersion = packageJson.devDependencies?.react
if (!/^19\.\d+\.\d+$/.test(expectedReactVersion ?? '') || !remoteApp.includes(expectedReactVersion)) {
  throw new Error(`Presentation Studio iframe bundle does not contain the declared React 19 runtime: ${expectedReactVersion ?? 'missing'}`)
}
for (const packageName of [
  '@fontsource/anton',
  '@fontsource/archivo',
  '@fontsource/caveat',
  '@fontsource/ibm-plex-mono',
  '@fontsource/ibm-plex-sans',
  '@fontsource/inter',
  '@fontsource/jetbrains-mono',
  '@fontsource/newsreader',
  '@fontsource/space-grotesk',
  '@fontsource/space-mono'
]) {
  if (!/^\d+\.\d+\.\d+$/.test(packageJson.dependencies?.[packageName] ?? '')) {
    throw new Error(`Missing exact Fontsource runtime dependency: ${packageName}`)
  }
}

for (const removedFile of [
  'dist/lib/presentation-render-diff.js',
  'dist/lib/presentation-render-diff.d.ts'
]) {
  try {
    await access(join(root, removedFile), constants.F_OK)
    throw new Error(`Obsolete editor bridge output is still present: ${removedFile}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue
    throw error
  }
}

// Verify the artifact users actually install. Checking only dist is
// insufficient because npm pack applies its own immutable exclusion rules.
const packRoot = await mkdtemp(join(tmpdir(), 'presentation-studio-pack-'))
try {
  const { stdout } = await execFileAsync('npm', [
    'pack', '--ignore-scripts', '--json', '--pack-destination', packRoot
  ], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
  const packs = JSON.parse(stdout)
  const filename = Array.isArray(packs) && typeof packs[0]?.filename === 'string'
    ? packs[0].filename
    : null
  if (!filename) throw new Error('npm pack did not return a package filename.')
  await execFileAsync('tar', ['-xzf', join(packRoot, filename), '-C', packRoot])
  await execFileAsync(process.execPath, ['scripts/verify-sandbox-action.mjs'], {
    cwd: join(packRoot, 'package'),
    maxBuffer: 16 * 1024 * 1024
  })
} finally {
  await rm(packRoot, { recursive: true, force: true })
}
console.log('Presentation Studio package output verified.')
