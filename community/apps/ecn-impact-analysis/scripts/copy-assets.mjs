import { cp, mkdir, readFile, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const check = process.argv.includes('--check')

// tsc outputs must exist in both modes.
for (const file of ['dist/index.js', 'dist/index.d.ts']) {
  await stat(join(packageRoot, file))
}

// Generated remote assets must be present and, in check mode, identical to source.
for (const file of [
  'src/lib/remote-components/ecn-workbench/app.js',
  'src/lib/remote-components/ecn-workbench/app.css'
]) {
  await stat(join(packageRoot, file))
}

if (check) {
  const pairs = [
    ['src/xpert-ecn-impact-assistant.yaml', 'dist/xpert-ecn-impact-assistant.yaml'],
    ['src/lib/remote-components/ecn-workbench/app.js', 'dist/lib/remote-components/ecn-workbench/app.js'],
    ['src/lib/remote-components/ecn-workbench/app.css', 'dist/lib/remote-components/ecn-workbench/app.css']
  ]
  for (const [source, target] of pairs) {
    const expected = await readFile(join(packageRoot, source))
    const current = await readFile(join(packageRoot, target))
    if (!expected.equals(current)) throw new Error('stale_asset: ' + target)
  }
} else {
  await mkdir(join(packageRoot, 'dist', 'lib'), { recursive: true })
  await cp(
    join(packageRoot, 'src', 'xpert-ecn-impact-assistant.yaml'),
    join(packageRoot, 'dist', 'xpert-ecn-impact-assistant.yaml')
  )
  await cp(
    join(packageRoot, 'src', 'lib', 'remote-components'),
    join(packageRoot, 'dist', 'lib', 'remote-components'),
    { recursive: true }
  )
}
