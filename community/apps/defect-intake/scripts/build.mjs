import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const require = createRequire(import.meta.url)
const temporary = await mkdtemp(join(tmpdir(), 'defect-intake-assets-'))
try {
  const bundle = await build({ absWorkingDir: root, entryPoints: ['src/remote/main.tsx'], outfile: 'app.js', bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', minify: true, sourcemap: false, legalComments: 'none', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'single-react-runtime', setup(api) { api.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, args => ({ path: require.resolve(args.path) })) } }] })
  execFileSync('tailwindcss', ['-i', join(root, 'src/remote/style.css'), '-o', join(temporary, 'app.css'), '--minify'], { cwd: root, stdio: 'pipe' })
  const js = bundle.outputFiles[0].text
  // Keep generated code safe when inlined into the SDK's srcdoc HTML.
  const safeJs = js.replace(/<\/script/gi, '<\\/script')
  const assets = { 'app.js': safeJs, 'app.css': await readFile(join(temporary, 'app.css'), 'utf8') }
  await mkdir(join(root, 'dist/remote'), { recursive: true })
  for (const [name, content] of Object.entries(assets)) {
    const target = join(root, 'dist/remote', name)
    if (check) {
      if (await readFile(target, 'utf8') !== content) throw new Error(`Stale ${name}; run build.`)
    } else await writeFile(target, content)
  }
  console.log(check ? 'Remote assets are current.' : 'Remote assets built.')
} finally { await rm(temporary, { recursive: true, force: true }) }
