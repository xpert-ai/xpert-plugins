import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnUiSourceEntry = join(workspaceRoot, 'packages', 'shadcn-ui', 'dist', 'index.js')
const requireFromPackage = createRequire(join(packageRoot, 'package.json'))
const reactRuntimeEntries = new Map([
  ['react', requireFromPackage.resolve('react')],
  ['react-dom', requireFromPackage.resolve('react-dom')],
  ['react-dom/client', requireFromPackage.resolve('react-dom/client')],
  ['react/jsx-runtime', requireFromPackage.resolve('react/jsx-runtime')],
  ['react/jsx-dev-runtime', requireFromPackage.resolve('react/jsx-dev-runtime')]
])
const componentName = 'presentation-studio-workbench'
const sourceExtensions = new Set(['.ts', '.tsx'])

async function listSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSources(path)
    return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : []
  }))
  return files.flat()
}

async function validateSources(sourceDir) {
  await Promise.all((await listSources(sourceDir)).map(async (file) => {
    await transform(await readFile(file, 'utf8'), {
      loader: extname(file) === '.tsx' ? 'tsx' : 'ts', jsx: 'automatic', jsxImportSource: 'react',
      sourcefile: file, format: 'esm', target: 'es2020'
    })
  }))
}

function reactRuntimePlugin() {
  return {
    name: 'presentation-studio-react-runtime',
    setup(api) {
      api.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
        const path = reactRuntimeEntries.get(args.path)
        return path ? { path } : undefined
      })
    }
  }
}

function localWorkspacePackagesPlugin() {
  return {
    name: 'xpert-local-workspace-packages',
    setup(api) {
      api.onResolve({ filter: /^@xpert-ai\/plugin-shadcn-ui$/ }, () => ({ path: shadcnUiSourceEntry }))
    }
  }
}

const componentDir = join(remoteRoot, componentName)
const sourceDir = join(componentDir, 'src')
const entryPoint = join(sourceDir, 'main.tsx')
if (!existsSync(entryPoint)) throw new Error(`Missing remote component entry: ${relative(process.cwd(), entryPoint)}`)
const reactPackage = JSON.parse(await readFile(requireFromPackage.resolve('react/package.json'), 'utf8'))
if (typeof reactPackage.version !== 'string' || !reactPackage.version.startsWith('19.')) {
  throw new Error(`Presentation Studio iframe requires React 19, resolved ${reactPackage.version ?? 'unknown'}`)
}
await validateSources(sourceDir)
const result = await build({
  entryPoints: [entryPoint], bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  conditions: ['@xpert-plugins-starter/source', 'production', 'module'], outdir: componentDir, entryNames: 'app', write: false,
  logLevel: 'silent', legalComments: 'none', minify: true, jsx: 'automatic', jsxImportSource: 'react',
  loader: { '.css': 'css', '.woff2': 'dataurl' }, plugins: [localWorkspacePackagesPlugin(), reactRuntimePlugin()],
  banner: { js: ';' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' }
})
const js = result.outputFiles?.find((file) => file.path.endsWith('.js'))
if (!js) throw new Error('esbuild did not produce app.js')
const css = result.outputFiles?.find((file) => file.path.endsWith('.css'))
const outputs = [
  { path: join(componentDir, 'app.js'), text: normalize(js.text) },
  { path: join(componentDir, 'app.css'), text: normalize(css?.text ?? '') }
]

if (process.argv.includes('--check')) {
  let stale = false
  for (const output of outputs) {
    const current = existsSync(output.path) ? await readFile(output.path, 'utf8') : ''
    if (current !== output.text) { console.error(`${relative(process.cwd(), output.path)} is out of date. Run pnpm build.`); stale = true }
  }
  if (stale) process.exit(1)
} else {
  await Promise.all(outputs.map((output) => writeFile(output.path, output.text)))
}

function normalize(value) { return value.replace(/[ \t]+$/gm, '') }
