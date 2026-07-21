import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const execFileAsync = promisify(execFile)
const themeKeys = Array.from({ length: 14 }, (_, index) => `theme${String(index + 1).padStart(2, '0')}`)
const bundledThemeRuntimeFiles = themeKeys.flatMap((themeKey) => [
  `skills/dashi-theme-generator/project/dist/theme-runtime/${themeKey}.module.mjs`,
  `skills/dashi-theme-generator/project/dist/theme-runtime/imported-theme-runtime.${themeKey}.js`
])
const requiredPackageFiles = [
  'dist/index.js', 'dist/index.d.ts',
  'dist/lib/remote-components/presentation-studio-workbench/app.js',
  'dist/lib/remote-components/presentation-studio-workbench/app.css',
  'dist/xpert-presentation-studio-assistant.yaml',
  'dist/sandbox-actions/presentation-export/action.json',
  'dist/sandbox-actions/presentation-export/bundle/runner.mjs',
  'dist/sandbox-actions/presentation-export/bundle/project/layout-manifest.json',
  'assets/upstream/UPSTREAM.json',
  '.xpertai-plugin/plugin.json',
  'skills/dashi-theme-generator/SKILL.md',
  'skills/dashi-theme-generator/agents/openai.yaml',
  'skills/dashi-theme-generator/scripts/finalize-plugin-theme.mjs',
  'skills/dashi-theme-generator/project/package.json',
  'skills/dashi-theme-generator/project/scripts/package-presentation-theme.mjs',
  'skills/dashi-theme-generator/project/src/components/themes/theme14/runtime.jsx',
  ...bundledThemeRuntimeFiles
]
for (const file of requiredPackageFiles) await access(join(root, file))

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const assistantDsl = await readFile(join(root, 'dist/xpert-presentation-studio-assistant.yaml'), 'utf8')
if (assistantDsl.includes('skillsMiddleware') || assistantDsl.includes('Middleware_Skills')) {
  throw new Error('Presentation Studio assistant must expose the built-in theme generator without skillsMiddleware.')
}
if (!assistantDsl.includes('presentation_open_dashi_theme_generator')) {
  throw new Error('Presentation Studio assistant does not open the built-in dashi-theme-generator.')
}
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
  for (const file of [
    'skills/dashi-theme-generator/SKILL.md',
    'skills/dashi-theme-generator/agents/openai.yaml',
    'skills/dashi-theme-generator/scripts/finalize-plugin-theme.mjs',
    'skills/dashi-theme-generator/project/package.json',
    'skills/dashi-theme-generator/project/scripts/package-presentation-theme.mjs',
    ...bundledThemeRuntimeFiles
  ]) await access(join(packRoot, 'package', file))
  try {
    await access(join(packRoot, 'package', 'skills', 'dashi-theme-generator', 'project', 'node_modules'), constants.F_OK)
    throw new Error('Bundled theme authoring project must not contain node_modules.')
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  await execFileAsync(process.execPath, ['scripts/verify-sandbox-action.mjs'], {
    cwd: join(packRoot, 'package'),
    maxBuffer: 16 * 1024 * 1024
  })
} finally {
  await rm(packRoot, { recursive: true, force: true })
}
console.log('Presentation Studio package output verified.')
