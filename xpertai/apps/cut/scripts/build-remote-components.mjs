import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, transform } from 'esbuild'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', 'cut-workbench')
const sourceDir = join(componentDir, 'src')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnUiDistEntry = join(workspaceRoot, 'packages', 'shadcn-ui', 'dist', 'index.js')

async function sourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : []
  }))).flat()
}

for (const file of await sourceFiles(sourceDir)) {
  await transform(await readFile(file, 'utf8'), {
    loader: extname(file) === '.tsx' ? 'tsx' : 'ts', jsxFactory: 'h', jsxFragment: 'React.Fragment', sourcefile: file, format: 'esm', target: 'es2020'
  })
}

const shims = new Map([
  ['react', join(sourceDir, 'react-shim.ts')],
  ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
  ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
  ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
  ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
])
const reactShim = {
  name: 'cut-react-global-shims',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
      const path = shims.get(args.path)
      return path ? { path } : undefined
    })
  }
}
const localWorkspacePackages = {
  name: 'cut-local-workspace-packages',
  setup(buildApi) {
    buildApi.onResolve({ filter: /^@xpert-ai\/plugin-shadcn-ui$/ }, () => ({ path: shadcnUiDistEntry }))
  }
}
const workerResult = await build({
  entryPoints: [join(sourceDir, 'cut-transcription.worker.ts')], bundle: true, format: 'iife', platform: 'browser', target: ['es2022'],
  write: false, logLevel: 'silent', legalComments: 'none', minify: true,
  conditions: ['onnxruntime-web-use-extern-wasm'],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})
const transcriptionWorkerSource = workerResult.outputFiles?.find((file) => file.path.endsWith('.js'))?.text
  ?? workerResult.outputFiles?.[0]?.text
  ?? ''
if (!transcriptionWorkerSource) throw new Error('Cut transcription worker build produced no JavaScript output.')
const result = await build({
  entryPoints: [join(sourceDir, 'main.tsx')], bundle: true, format: 'iife', platform: 'browser', target: ['es2020'],
  outdir: componentDir, entryNames: 'app', assetNames: 'assets/[name]-[hash]', write: false, logLevel: 'silent', legalComments: 'none', minify: true,
  jsxFactory: 'h', jsxFragment: 'React.Fragment', plugins: [localWorkspacePackages, reactShim], banner: { js: ';' },
  loader: { '.woff2': 'dataurl' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': '"false"',
    __CUT_TRANSCRIPTION_WORKER_SOURCE__: JSON.stringify(transcriptionWorkerSource)
  }
})
const js = result.outputFiles?.find((file) => file.path.endsWith('.js'))?.text ?? ''
const css = result.outputFiles?.find((file) => file.path.endsWith('.css'))?.text ?? ''
const outputs = [[join(componentDir, 'app.js'), js], [join(componentDir, 'app.css'), css]]

if (process.argv.includes('--check')) {
  let stale = false
  for (const [path, output] of outputs) {
    const current = existsSync(path) ? await readFile(path, 'utf8') : ''
    if (current !== output) { console.error(`${relative(process.cwd(), path)} is out of date. Run pnpm build.`); stale = true }
  }
  if (stale) process.exit(1)
} else {
  await Promise.all(outputs.map(([path, output]) => writeFile(path, output)))
}
