import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const packageRoot = join(scriptDir, '..')
const componentRoot = join(packageRoot, 'src', 'lib', 'remote-components', 'review-workbench')
const sourceRoot = join(componentRoot, 'src')
const check = process.argv.includes('--check')
const outputRoot = check
  ? join(tmpdir(), `img2threejs-remote-check-${process.pid}`)
  : componentRoot

if (check) rmSync(outputRoot, { recursive: true, force: true })
else {
  rmSync(join(componentRoot, 'app.js'), { force: true })
  rmSync(join(componentRoot, 'app.css'), { force: true })
}
mkdirSync(outputRoot, { recursive: true })

const reactAliases = new Map([
  ['react', join(sourceRoot, 'react-shim.ts')],
  ['react-dom/client', join(sourceRoot, 'react-dom-client-shim.ts')]
])

await build({
  entryPoints: [join(sourceRoot, 'main.tsx')],
  outfile: join(outputRoot, 'app.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XpertImg2ThreeJsWorkbench',
  platform: 'browser',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: ['es2020'],
  minify: false,
  sourcemap: false,
  legalComments: 'none',
  plugins: [{
    name: 'react-runtime-globals',
    setup(buildApi) {
      buildApi.onResolve({ filter: /^(react|react-dom\/client)$/ }, (args) => {
        const path = reactAliases.get(args.path)
        return path ? { path } : undefined
      })
    }
  }]
})

writeFileSync(
  join(outputRoot, 'app.css'),
  [
    readFileSync(join(sourceRoot, 'styles.css'), 'utf8'),
    readFileSync(join(sourceRoot, 'viewer.css'), 'utf8'),
    readFileSync(join(sourceRoot, 'compact-layout.css'), 'utf8')
  ].join('\n')
)

if (check) {
  for (const name of ['app.js', 'app.css']) {
    const generated = readFileSync(join(outputRoot, name))
    const committedPath = join(componentRoot, name)
    if (!existsSync(committedPath) || !generated.equals(readFileSync(committedPath))) {
      rmSync(outputRoot, { recursive: true, force: true })
      throw new Error(`Generated remote component asset is stale: ${name}`)
    }
  }
  rmSync(outputRoot, { recursive: true, force: true })
}
