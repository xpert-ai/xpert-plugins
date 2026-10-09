import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = dirname(dirname(fileURLToPath(import.meta.url)))
await mkdir(join(root, 'dist/ui'), { recursive: true })
await build({ entryPoints: [join(root, 'src/ui/main.tsx')], outfile: join(root, 'dist/ui/app.js.tmp'), bundle: true, format: 'iife', target: 'es2022', jsx: 'automatic', minify: true,
 tsconfig: join(root, 'tsconfig.ui.json'), define: { 'process.env.NODE_ENV': '"production"' } })
execFileSync(process.execPath, [join(root, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(root, 'src/ui/styles.css'), '-o', join(root, 'dist/ui/app.css.tmp'), '--minify'], { stdio: 'inherit', cwd: root })
for (const name of ['app.js', 'app.css']) { const content = await readFile(join(root, 'dist/ui', name + '.tmp')); if (!content.length) throw Error('Empty asset'); await rename(join(root, 'dist/ui', name + '.tmp'), join(root, 'dist/ui', name)) }
await copyFile(join(root, 'src/assistant.yaml'), join(root, 'dist/assistant.yaml'))
const hashes = {}
for (const name of ['app.js', 'app.css']) hashes[name] = createHash('sha256').update(await readFile(join(root, 'dist/ui', name))).digest('hex')
await writeFile(join(root, 'dist/ui/assets.json.tmp'), JSON.stringify(hashes, null, 2)); JSON.parse(await readFile(join(root, 'dist/ui/assets.json.tmp'), 'utf8'))
await rename(join(root, 'dist/ui/assets.json.tmp'), join(root, 'dist/ui/assets.json'))
console.log('Built shared production/preview UI assets')
