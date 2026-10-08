import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// Verify fresh host SDK builds without relinking a developer's running platform.
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const provider = process.argv[2]
if (!['openai', 'anthropic'].includes(provider)) throw new Error('Expected openai or anthropic')
const source = join(workspace, 'models', provider)
const platform = process.env.XPERT_PLATFORM_ROOT
if (!platform) throw new Error('Set XPERT_PLATFORM_ROOT to the source platform checkout with SDK/contracts dist built')
const staging = await mkdtemp(join(tmpdir(), 'xpert-native-provider-'))
function run(command, args, cwd = staging) {
  const child = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env })
  if (child.status !== 0) throw new Error(`${command} failed (${child.status})`)
}
async function dependencies(root) {
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue
    const destination = join(staging, 'node_modules', item.name)
    if (item.name.startsWith('@')) {
      await mkdir(destination, { recursive: true })
      for (const child of await readdir(join(root, item.name))) {
        if (item.name === '@xpert-ai' && ['plugin-sdk', 'contracts'].includes(child)) continue
        await symlink(join(root, item.name, child), join(destination, child)).catch((e) => {
          if (e.code !== 'EEXIST') throw e
        })
      }
    } else
      await symlink(join(root, item.name), destination).catch((e) => {
        if (e.code !== 'EEXIST') throw e
      })
  }
}
try {
  await mkdir(join(staging, 'node_modules'), { recursive: true })
  await dependencies(join(workspace, 'node_modules'))
  await dependencies(join(resolve(platform), 'node_modules'))
  for (const name of ['contracts', 'plugin-sdk'])
    await cp(join(resolve(platform), 'packages', name, 'dist'), join(staging, 'node_modules/@xpert-ai', name), {
      recursive: true
    })
  await cp(join(source, 'src'), join(staging, 'src'), { recursive: true })

  await cp(join(source, 'package.json'), join(staging, 'package.json'))
  await cp(join(workspace, 'scripts/native-provider.test.mjs'), join(staging, 'native-provider.test.mjs'))
  const base = JSON.parse(await readFile(join(workspace, 'tsconfig.base.json'), 'utf8'))
  await writeFile(
    join(staging, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        ...base.compilerOptions,
        composite: false,
        customConditions: [],
        declaration: true,
        emitDeclarationOnly: false,
        rootDir: 'src',
        outDir: 'dist',
        types: ['node'],
        declarationMap: false
      },
      include: ['src/**/*.ts'], exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts']
    })
  )
  run(process.execPath, [join(workspace, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'])
  // Native provider lifecycle uses compiled runtime exports and copied catalog assets.
  await cp(join(source, 'scripts'), join(staging, 'scripts'), { recursive: true })
  run(process.execPath, ['scripts/copy-assets.mjs'])
  run(process.execPath, ['--test', 'native-provider.test.mjs'])
  const packageName = JSON.parse(await readFile(join(source, 'package.json'), 'utf8')).name
  await symlink(staging, join(staging, 'node_modules', packageName))
  run(process.execPath, [
    resolve(workspace, '../plugin-dev-harness/dist/index.js'),
    '--workspace',
    staging,
    '--plugin',
    packageName
  ])
  await cp(join(staging, 'dist'), join(source, 'dist'), { recursive: true })
  console.log('Native provider build, protocol boundary tests and dist-first lifecycle passed. No deployment performed.')
} finally {
  await rm(staging, { recursive: true, force: true })
}
