// Validate the paired SDK declarations without mutating the installed dependency tree.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

assert.equal(process.argv.length, 3, 'Usage: node tests/typecheck-platform.mjs /absolute/platform/packages/plugin-sdk/dist')
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sdk = path.resolve(process.argv[2])
const require = createRequire(path.join(plugin, 'package.json'))
for (const entry of ['index.d.ts', 'data-workbench.d.ts']) assert.ok(existsSync(path.join(sdk, entry)), `Build the platform SDK first: ${entry}`)
const temporary = mkdtempSync(path.join(tmpdir(), 'hana-sdk-types-'))
try {
  const config = path.join(temporary, 'tsconfig.json')
  writeFileSync(config, JSON.stringify({ extends: path.join(plugin, 'tsconfig.lib.json'), compilerOptions: {
    tsBuildInfoFile: path.join(temporary, 'build.tsbuildinfo'),
    typeRoots: [path.dirname(path.dirname(require.resolve('@types/node/package.json')))],
    paths: { '@xpert-ai/plugin-sdk': [path.join(sdk, 'index.d.ts')],
      '@xpert-ai/plugin-sdk/data-workbench': [path.join(sdk, 'data-workbench.d.ts')] }
  }, include: [path.join(plugin, 'src/**/*.ts')], exclude: [path.join(plugin, 'src/**/*.spec.ts')] }, null, 2))
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', config], { cwd: plugin, stdio: 'inherit' })
  console.log('HANA build/typecheck passed against the paired SDK declarations.')
} finally { rmSync(temporary, { recursive: true, force: true }) }
