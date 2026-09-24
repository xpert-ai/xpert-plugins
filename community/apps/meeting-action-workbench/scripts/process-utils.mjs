import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const workspaceRoot = join(packageRoot, '..', '..', '..')
export const requireFromPackage = createRequire(join(packageRoot, 'package.json'))

export function runNode(script, args = [], cwd = packageRoot) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

export function runTsc(config) {
  runNode(requireFromPackage.resolve('typescript/bin/tsc'), ['-p', join(packageRoot, config), '--noEmit'])
}
