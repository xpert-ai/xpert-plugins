import { build } from 'esbuild'
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const output = resolve(root, 'dist/remote')
await mkdir(output, { recursive: true })
const bundle = await build({
  entryPoints: [resolve(root, 'remote-components/workbench/src/main.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: true,
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  legalComments: 'inline'
})
const app = bundle.outputFiles[0].contents
const checking = process.argv.includes('--check')
if (
  checking &&
  !Buffer.from(app).equals(await readFile(resolve(output, 'app.js')))
)
  throw new Error('Generated JavaScript is stale')
if (!checking) await writeFile(resolve(output, 'app.js'), app)
const cli = resolve(
  dirname(require.resolve('@tailwindcss/cli/package.json')),
  'dist/index.mjs'
)
const style = execFileSync(
  process.execPath,
  [cli, '-i', 'remote-components/workbench/src/style.css', '--minify'],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }
)
if (checking && style !== (await readFile(resolve(output, 'app.css'), 'utf8')))
  throw new Error('Generated CSS is stale')
if (!checking) {
  await writeFile(resolve(output, 'app.css'), style)
  await copyFile(
    resolve(root, 'src/assistant.yaml'),
    resolve(root, 'dist/assistant.yaml')
  )
}
console.log(checking ? 'Generated assets verified' : 'Remote workbench built')
