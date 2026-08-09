import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Keep publish stdout JSON-clean for Nx.
 *
 * Nx asks pnpm to publish with JSON output. When a lifecycle step fails, Nx
 * parses stdout directly as JSON; build logs on stdout therefore hide the real
 * npm error. Run the complete build here while forwarding child output to
 * stderr, leaving stdout exclusively for pnpm's publish response.
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = resolve(packageRoot, '../../..')
const shadcnUiRoot = join(repositoryRoot, 'packages', 'shadcn-ui')
const requireFromPackage = createRequire(join(packageRoot, 'package.json'))
const requireFromShadcnUi = createRequire(
  join(shadcnUiRoot, 'package.json')
)

function run(command, args, options = {}) {
  process.stderr.write(`$ ${[command, ...args].join(' ')}\n`)

  const result = spawnSync(command, args, {
    cwd: options.cwd ?? packageRoot,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 100,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })

  if (result.stdout) {
    process.stderr.write(result.stdout)
  }
  if (result.stderr) {
    process.stderr.write(result.stderr)
  }
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`)
    process.exit(1)
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runNode(scriptPath, args = [], options = {}) {
  run(process.execPath, [scriptPath, ...args], options)
}

function packageFile(requireFromRoot, packageName, filePath) {
  return join(
    dirname(requireFromRoot.resolve(`${packageName}/package.json`)),
    filePath
  )
}

runNode(packageFile(requireFromShadcnUi, 'vite', 'bin/vite.js'), ['build'], {
  cwd: shadcnUiRoot
})
runNode(join(packageRoot, 'scripts', 'clean-build-output.mjs'))
runNode(requireFromShadcnUi.resolve('typescript/bin/tsc'), [
  '-p',
  'tsconfig.lib.json',
  '--emitDeclarationOnly'
], {
  cwd: shadcnUiRoot
})
runNode(join(packageRoot, 'scripts', 'build-remote-components.mjs'))
runNode(requireFromPackage.resolve('typescript/bin/tsc'), [
  '-p',
  'tsconfig.lib.json'
])
runNode(join(packageRoot, 'scripts', 'copy-assets.mjs'))
runNode(join(packageRoot, 'scripts', 'build-sandbox-action.mjs'))
runNode(join(packageRoot, 'scripts', 'verify-sandbox-action.mjs'))
runNode(join(packageRoot, 'scripts', 'verify-package-output.mjs'))
