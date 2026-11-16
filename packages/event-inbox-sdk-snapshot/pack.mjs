import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const sourceDigest = '9a163315bb7c314783a0b2a758ad6365a7b210bc415cbb5c342d20d0c41cc08e'
const version = '3.36.0-outbox.5'
const [checkout, destination] = process.argv.slice(2)
if (!checkout) throw new Error('Usage: node pack.mjs <xpert-checkout> [output-directory]')
const root = path.resolve(checkout)
const output = destination ? path.resolve(destination) : fileURLToPath(new URL('.', import.meta.url))
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'packages/contracts', 'packages/plugin-sdk'],
  { cwd: root, encoding: 'utf8' }
)
const hash = createHash('sha256')
for (const file of [...new Set(files.split('\0').filter(Boolean))].sort()) {
  hash.update(file + '\0').update(
    createHash('sha256')
      .update(await readFile(path.join(root, file)))
      .digest()
  )
}
if (hash.digest('hex') !== sourceDigest) throw new Error('SDK or contracts sources differ from this snapshot')
execFileSync('corepack', ['pnpm', 'exec', 'nx', 'run', 'plugin-sdk:build', '--skip-nx-cache'], {
  cwd: root,
  stdio: 'inherit'
})

const require = createRequire(path.join(root, 'package.json'))
const workspace = require('yaml').parse(await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8'))
const { rewriteCatalogDependencies } = await import(
  pathToFileURL(path.join(root, 'tools/release/catalog-dependencies.mjs'))
)
const temp = await mkdtemp(path.join(tmpdir(), 'event-inbox-sdk-'))
try {
  await mkdir(output, { recursive: true })
  for (const name of ['contracts', 'plugin-sdk']) {
    const dir = path.join(temp, name)
    await cp(path.join(root, 'packages', name, 'dist'), dir, { recursive: true })
    const manifest = path.join(dir, 'package.json')
    const pkg = JSON.parse(await readFile(manifest, 'utf8'))
    pkg.version = version
    pkg.xpertSourceDigest = sourceDigest
    rewriteCatalogDependencies(pkg, workspace)
    if (name === 'plugin-sdk') pkg.dependencies['@xpert-ai/contracts'] = version
    await writeFile(manifest, JSON.stringify(pkg, null, 2) + '\n')
    execFileSync('npm', ['pack', '--silent', '--ignore-scripts', '--pack-destination', output], {
      cwd: dir,
      stdio: 'inherit'
    })
  }
} finally {
  await rm(temp, { recursive: true, force: true })
}
