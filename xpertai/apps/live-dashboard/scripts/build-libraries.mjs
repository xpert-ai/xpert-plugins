import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url))), require = createRequire(import.meta.url)
const packageIndex = process.argv.indexOf('--verify-package')
const target = join(packageIndex >= 0 ? resolve(process.argv[packageIndex + 1]) : root, 'dist/libraries')
const verify = process.argv.includes('--verify') || packageIndex >= 0
const echartsRoot = dirname(require.resolve('echarts/package.json'))
const threeRoot = dirname(dirname(require.resolve('three')))
const [echartsPackage, threePackage] = await Promise.all([echartsRoot, threeRoot].map(path => readFile(join(path, 'package.json'), 'utf8').then(JSON.parse)))
const built = await build({ configFile: false, root, logLevel: 'error', build: { write: false, target: 'es2022', minify: true,
  lib: { entry: join(threeRoot, 'build/three.module.js'), name: 'THREE', formats: ['iife'] } } })
const chunk = (Array.isArray(built) ? built : [built]).flatMap(output => output.output).find(output => output.type === 'chunk' && output.isEntry)
if (!chunk) throw Error('Missing Three.js bundle')
const entries = [
  { id: 'echarts', version: echartsPackage.version, global: 'echarts', source: await readFile(join(echartsRoot, 'dist/echarts.min.js'), 'utf8') },
  { id: 'three', version: threePackage.version, global: 'THREE', source: chunk.code }
].map(item => ({ ...item, format: 'classic-script', sha256: createHash('sha256').update(item.source).digest('hex') }))
const files = { 'catalog.json': JSON.stringify(entries),
  'ECHARTS-LICENSE.txt': await readFile(join(echartsRoot, 'LICENSE'), 'utf8'),
  'ECHARTS-NOTICE.txt': await readFile(join(echartsRoot, 'NOTICE'), 'utf8'),
  'THREE-LICENSE.txt': await readFile(join(threeRoot, 'LICENSE'), 'utf8') }
if (!verify) await mkdir(target, { recursive: true })
else if (JSON.stringify((await readdir(target)).sort()) !== JSON.stringify(Object.keys(files).sort())) throw Error('Library bundle files differ')
for (const [name, content] of Object.entries(files)) {
  if (verify) { if (await readFile(join(target, name), 'utf8') !== content) throw Error(`Stale library bundle: ${name}`) }
  else await writeFile(join(target, name), content)
}
