import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('..', import.meta.url))
const outputDir = join(root, 'dist/remote')
const cliPackage = require.resolve('@tailwindcss/cli/package.json')
const tailwind = join(dirname(cliPackage), JSON.parse(await readFile(cliPackage, 'utf8')).bin.tailwindcss)
const { stdout: utilityCss, stderr, status, error } = spawnSync(process.execPath, [
  tailwind, '-i', join(root, 'remote/styles.css'), '--minify',
], { cwd: root, encoding: 'utf8' })
if (error) throw error
if (status !== 0 || !utilityCss.includes('.manufacturing-shell') || !utilityCss.includes('.tabular-nums')) {
  throw new Error(stderr || 'Remote stylesheet generation failed')
}

const { outputFiles } = await build({
  absWorkingDir: root,
  entryPoints: ['remote/main.tsx'],
  outfile: join(outputDir, 'app.js'),
  write: false,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  jsx: 'automatic',
  legalComments: 'eof',
  // The app, its renderer and all shared controls must use the same React dispatcher.
  alias: {
    react: dirname(require.resolve('react/package.json')),
    'react-dom': dirname(require.resolve('react-dom/package.json')),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
})
const shadcnCss = await readFile(require.resolve('@xpert-ai/plugin-shadcn-ui/style.css'), 'utf8')
const outputs = { 'app.js': outputFiles[0].text, 'app.css': `${shadcnCss}\n${utilityCss}` }

if (process.argv.includes('--check')) {
  for (const [name, content] of Object.entries(outputs)) {
    if (await readFile(join(outputDir, name), 'utf8') !== content) throw new Error(`Stale remote asset: ${name}`)
  }
} else {
  await mkdir(outputDir, { recursive: true })
  await Promise.all(Object.entries(outputs).map(([name, content]) => writeFile(join(outputDir, name), content)))
}
