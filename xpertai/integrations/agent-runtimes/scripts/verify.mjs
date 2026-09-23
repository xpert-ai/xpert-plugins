import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

// Verify fresh host SDK builds without relinking a developer's running platform.
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(source, '../..')
const platform = process.env.XPERT_PLATFORM_ROOT
if (!platform) throw new Error('Set XPERT_PLATFORM_ROOT to the source platform checkout with SDK/contracts dist built')
const staging = await mkdtemp(join(tmpdir(), 'xpert-agent-runtimes-'))
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
  await cp(join(source, 'tests'), join(staging, 'tests'), { recursive: true })
  await cp(join(source, 'package.json'), join(staging, 'package.json'))
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
      include: ['src/**/*.ts']
    })
  )
  run(process.execPath, [join(workspace, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'])
  run(process.execPath, [
    '--test',
    ...(await readdir(join(staging, 'tests')))
      .filter((file) => file.endsWith('.test.mjs'))
      .map((file) => `tests/${file}`)
  ])
  await symlink(staging, join(staging, 'node_modules/@xpert-ai/plugin-agent-runtimes'))
  run(process.execPath, [
    resolve(workspace, '../plugin-dev-harness/dist/index.js'),
    '--workspace',
    staging,
    '--plugin',
    '@xpert-ai/plugin-agent-runtimes'
  ])
  await cp(join(staging, 'dist'), join(source, 'dist'), { recursive: true })
  console.log('Agent runtime build, protocol tests and dist-first lifecycle passed. No deployment performed.')
} finally {
  await rm(staging, { recursive: true, force: true })
}
