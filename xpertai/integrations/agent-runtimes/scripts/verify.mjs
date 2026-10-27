import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

// Verify fresh host SDK builds without relinking a developer's running platform.
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = resolve(source, '../..')
const published = process.argv.includes('--published')
const platform = process.env.XPERT_PLATFORM_ROOT
if (!published && !platform)
  throw new Error('Set XPERT_PLATFORM_ROOT to the source platform checkout with SDK/contracts dist built')
const sourceCheckout = process.argv.includes('--source-checkout')
if (published && sourceCheckout) throw new Error('Published and source checkout verification are mutually exclusive')
if (process.argv.slice(2).some((arg) => !['--source-checkout', '--published'].includes(arg)))
  throw new Error('Unknown verification option')
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
  const { satisfies } = createRequire(join(workspace, 'package.json'))('semver')
  const manifest = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
  let plannedReleases = []
  if (sourceCheckout) {
    const planPath = join(staging, 'release-plan.json')
    run('corepack', ['pnpm', 'exec', 'changeset', 'status', '--output', planPath], resolve(platform))
    plannedReleases = JSON.parse(await readFile(planPath, 'utf8')).releases
  }
  for (const name of ['contracts', 'plugin-sdk']) {
    const packageName = `@xpert-ai/${name}`
    const built = JSON.parse(
      await readFile(
        published
          ? join(workspace, 'node_modules/@xpert-ai', name, 'package.json')
          : join(resolve(platform), 'packages', name, 'dist/package.json'),
        'utf8'
      )
    )
    const current = published
      ? built
      : JSON.parse(await readFile(join(resolve(platform), 'packages', name, 'package.json'), 'utf8'))
    if (built.version !== current.version) throw new Error(`${packageName} build is stale; rebuild the host package`)
    const required = manifest.peerDependencies[packageName]
    if (satisfies(built.version, required)) continue
    const planned = plannedReleases.find((item) => item.name === packageName && item.oldVersion === current.version)
    if (!sourceCheckout || !planned || !satisfies(planned.newVersion, required))
      throw new Error(
        `${packageName}@${built.version} does not satisfy ${required}. Release matching host packages first; use --source-checkout only for explicitly unreleased source validation.`
      )
    console.log(`${packageName}: source ${current.version}, planned ${planned.newVersion}; source validation only.`)
  }
  await mkdir(join(staging, 'node_modules'), { recursive: true })
  await dependencies(join(source, 'node_modules'))
  await dependencies(join(workspace, 'node_modules'))
  if (published) {
    // Keep pnpm's package-specific transitive dependencies; never substitute platform source/dist.
    for (const name of ['contracts', 'plugin-sdk'])
      await symlink(join(workspace, 'node_modules/@xpert-ai', name), join(staging, 'node_modules/@xpert-ai', name))
  } else {
    await dependencies(join(resolve(platform), 'node_modules'))
    // Source contracts must use the host's matching ChatKit dependency.
    const chatkit = join(staging, 'node_modules/@xpert-ai/chatkit-types')
    await rm(chatkit, { recursive: true, force: true })
    await symlink(join(resolve(platform), 'node_modules/@xpert-ai/chatkit-types'), chatkit)
    for (const name of ['contracts', 'plugin-sdk'])
      await cp(join(resolve(platform), 'packages', name, 'dist'), join(staging, 'node_modules/@xpert-ai', name), {
        recursive: true
      })
  }
  await cp(join(source, 'src'), join(staging, 'src'), { recursive: true })
  await cp(join(source, 'tests'), join(staging, 'tests'), { recursive: true })
  await cp(join(source, 'package.json'), join(staging, 'package.json'))
  await cp(join(source, 'README.md'), join(staging, 'README.md'))
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
  if (process.env.XPERT_RUNTIME_GUEST_TEST_IMAGE) {
    run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--pids-limit',
      '128',
      '--memory',
      '512m',
      '-v',
      `${workspace}:${workspace}:ro`,
      ...(!published ? ['-v', `${resolve(platform)}:${resolve(platform)}:ro`] : []),
      '-v',
      `${staging}:${staging}:ro`,
      '-w',
      staging,
      process.env.XPERT_RUNTIME_GUEST_TEST_IMAGE,
      'node',
      '--test',
      '--test-concurrency=1',
      'tests/runtime.test.mjs',
      'tests/failure-recovery.test.mjs',
      'tests/claude-sdk-control.test.mjs'
    ])
  }
  // Exercise precisely what production installs: a packed archive with no TypeScript source fallback.
  const packedDir = join(staging, 'packed')
  const extracted = join(staging, 'installed', 'package')
  await mkdir(packedDir, { recursive: true })
  await mkdir(dirname(extracted), { recursive: true })
  run('npm', ['pack', '--ignore-scripts', '--pack-destination', packedDir])
  const archiveName = (await readdir(packedDir)).find((file) => file.endsWith('.tgz'))
  if (!archiveName) throw new Error('No distributable archive was produced')
  const archive = join(packedDir, archiveName)
  run('tar', ['-xzf', archive, '-C', dirname(extracted)])
  const retired = ['config']
  const requiredAdapters = ['process-runtime', 'jsonl-process', 'codex.strategy', 'pi.strategy', 'claude.strategy']
  const builtFiles = await readdir(join(extracted, 'dist/lib'))
  if (requiredAdapters.some((name) => !builtFiles.includes(name + '.js')))
    throw new Error('A supported runtime adapter is missing from the package')
  if (builtFiles.some((file) => retired.some((name) => file.startsWith(name + '.'))))
    throw new Error('Legacy configuration schema leaked into the package')
  if ((await readdir(extracted)).includes('src')) throw new Error('Production package must load without source files')
  await symlink(join(staging, 'node_modules'), join(extracted, 'node_modules'))
  await symlink(extracted, join(staging, 'node_modules/@xpert-ai/plugin-agent-runtimes'))
  await cp(join(staging, 'tests'), join(extracted, 'tests'), { recursive: true })
  process.env.NODE_ENV = 'production'
  run(
    process.execPath,
    [
      '--test',
      ...(await readdir(join(extracted, 'tests')))
        .filter((file) => file.endsWith('.test.mjs'))
        .map((file) => `tests/${file}`)
    ],
    extracted
  )
  run(
    process.execPath,
    [
      resolve(workspace, '../plugin-dev-harness/dist/index.js'),
      '--workspace',
      extracted,
      '--plugin',
      '@xpert-ai/plugin-agent-runtimes',
      '--no-mocks'
    ],
    extracted
  )
  if (process.env.XPERT_RUNTIME_ARTIFACT_DIR) {
    const output = resolve(process.env.XPERT_RUNTIME_ARTIFACT_DIR)
    await mkdir(output, { recursive: true })
    await cp(archive, join(output, archiveName))
    await writeFile(
      join(output, 'package-verification.json'),
      JSON.stringify(
        {
          archive: archiveName,
          sha256: createHash('sha256')
            .update(await readFile(archive))
            .digest('hex'),
          node: process.version,
          environment: 'production',
          sourceCheckout,
          publishedPeers: published,
          sourceFallback: false,
          legacyConfiguration: false,
          retainedDirectAdapters: requiredAdapters,
          lifecycleMocks: false,
          externalComputerAndModel: 'simulated in protocol tests',
          publicRegistryRelease: false
        },
        null,
        2
      ) + '\n'
    )
  }
  // Remove only generated local output after the new package has passed every check.
  await rm(join(source, 'dist'), { recursive: true, force: true })
  await cp(join(extracted, 'dist'), join(source, 'dist'), { recursive: true })
  console.log(
    `Packed production runtime tests and dist-only lifecycle passed. ${
      sourceCheckout
        ? 'Unreleased source validation; not release compatibility.'
        : published
        ? 'Published npm peers satisfy the plugin requirements.'
        : 'Built host peer versions satisfy the plugin requirements.'
    } No deployment performed.`
  )
} finally {
  await rm(staging, { recursive: true, force: true })
}
