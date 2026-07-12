import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
for (const file of [
  'dist/index.js', 'dist/index.d.ts',
  'dist/lib/remote-components/presentation-studio-workbench/app.js',
  'dist/lib/remote-components/presentation-studio-workbench/app.css',
  'dist/xpert-presentation-studio-assistant.yaml',
  'assets/upstream/UPSTREAM.json',
  '.xpertai-plugin/plugin.json'
]) await access(join(root, file))

const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
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
console.log('Presentation Studio package output verified.')
