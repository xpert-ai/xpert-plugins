import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const remoteRoot = join(packageRoot, 'src', 'lib', 'remote-components')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnUiSourceEntry = join(workspaceRoot, 'packages', 'shadcn-ui', 'src', 'index.ts')
const pluginSdkSourceEntry = join(workspaceRoot, '..', 'xpert', 'packages', 'plugin-sdk', 'src', 'lib', 'collaboration', 'client.ts')
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
      loader: extname(file) === '.tsx' ? 'tsx' : 'ts', jsxFactory: 'h', jsxFragment: 'React.Fragment',
      sourcefile: file, format: 'esm', target: 'es2020'
    })
  }))
}

function reactShimPlugin(sourceDir) {
  const shims = new Map([
    ['react', join(sourceDir, 'react-shim.ts')],
    ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
    ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
    ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
    ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
  ])
  return {
    name: 'xpert-react-global-shims',
    setup(api) {
      api.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
        const path = shims.get(args.path)
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
      api.onResolve({ filter: /^@xpert-ai\/plugin-sdk$/ }, () => ({ path: pluginSdkSourceEntry }))
    }
  }
}

const componentDir = join(remoteRoot, componentName)
const sourceDir = join(componentDir, 'src')
const entryPoint = join(sourceDir, 'main.tsx')
if (!existsSync(entryPoint)) throw new Error(`Missing remote component entry: ${relative(process.cwd(), entryPoint)}`)
await validateSources(sourceDir)
const result = await build({
  entryPoints: [entryPoint], bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  conditions: ['@xpert-plugins-starter/source', 'production'], outdir: componentDir, entryNames: 'app', write: false,
  logLevel: 'silent', legalComments: 'none', minify: true, jsxFactory: 'h', jsxFragment: 'React.Fragment',
  loader: { '.css': 'css', '.woff2': 'dataurl' }, plugins: [localWorkspacePackagesPlugin(), reactShimPlugin(sourceDir)],
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
