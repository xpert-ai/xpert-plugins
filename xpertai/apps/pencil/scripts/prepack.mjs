import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Keep publish stdout JSON-clean for Nx.
 *
 * Nx's release-publish executor asks pnpm for JSON output, then parses stdout.
 * pnpm lifecycle scripts can mix build logs into stdout; on publish failures Nx
 * parses that polluted stdout directly and hides the real npm error. This wrapper
 * still runs the full build/verification flow, but forwards all child output to
 * stderr so stdout remains reserved for pnpm's publish JSON payload.
 *
 * It also avoids nested `pnpm run ...` calls. Release jobs can run under Node
 * debug flags or package-manager shims; invoking the underlying Node CLIs
 * directly makes the lifecycle step much less sensitive to that environment.
 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspaceRoot = resolve(packageRoot, '../../..')
const shadcnVueRoot = join(workspaceRoot, 'packages', 'shadcn-vue')
const requireFromPencil = createRequire(join(packageRoot, 'package.json'))
const requireFromShadcnVue = createRequire(join(shadcnVueRoot, 'package.json'))

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
  return join(dirname(requireFromRoot.resolve(`${packageName}/package.json`)), filePath)
}

runNode(packageFile(requireFromShadcnVue, 'vite', 'bin/vite.js'), ['build'], { cwd: shadcnVueRoot })
runNode(
  packageFile(requireFromShadcnVue, 'vue-tsc', 'bin/vue-tsc.js'),
  ['-p', 'tsconfig.lib.json', '--declaration', '--emitDeclarationOnly'],
  { cwd: shadcnVueRoot }
)
runNode(join(packageRoot, 'scripts', 'clean-dist.mjs'))
runNode(join(packageRoot, 'scripts', 'build-remote-components.mjs'))
runNode(requireFromPencil.resolve('typescript/bin/tsc'), ['-p', 'tsconfig.lib.json'])
runNode(join(packageRoot, '..', '..', 'scripts', 'vendor-design-fonts.mjs'))
runNode(join(packageRoot, 'scripts', 'copy-assets.mjs'))
runNode(join(packageRoot, 'scripts', 'verify-package-output.mjs'))
