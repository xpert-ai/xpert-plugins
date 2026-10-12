import { build } from 'esbuild'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(join(root, 'package.json'))
const execute = promisify(execFile)
const sharedStyle = require.resolve('@xpert-ai/plugin-shadcn-ui/style.css')
if (!existsSync(sharedStyle)) throw new Error('Build the current workspace @xpert-ai/plugin-shadcn-ui package first')
const temporary = await mkdtemp(join(tmpdir(), 'maps-tailwind-'))
const outputs = new Map()
const reactExports = ['Children','Component','Fragment','Profiler','PureComponent','StrictMode','Suspense','cloneElement','createContext','createElement','createFactory','createRef','forwardRef','isValidElement','lazy','memo','startTransition','useCallback','useContext','useDebugValue','useDeferredValue','useEffect','useId','useImperativeHandle','useInsertionEffect','useLayoutEffect','useMemo','useReducer','useRef','useState','useSyncExternalStore','useTransition','version']
const globals = {
  name: 'maps-host-react',
  setup(api) {
    api.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, args => ({ path: args.path, namespace: 'maps-host-react' }))
    api.onLoad({ filter: /.*/, namespace: 'maps-host-react' }, args => {
      if (args.path === 'react') return { contents: `const React=window.React;export default React;${reactExports.map(name => `export const ${name}=React.${name};`).join('')}`, loader: 'js' }
      if (args.path.startsWith('react-dom')) return { contents: 'const ReactDOM=window.ReactDOM;export default ReactDOM;export const createRoot=ReactDOM.createRoot,hydrateRoot=ReactDOM.hydrateRoot,createPortal=ReactDOM.createPortal,flushSync=ReactDOM.flushSync,version=ReactDOM.version;', loader: 'js' }
      return { contents: 'const React=window.React;export const Fragment=React.Fragment;export const jsx=(type,props,key)=>React.createElement(type,key===undefined?props:{...props,key});export const jsxs=jsx,jsxDEV=jsx;', loader: 'js' }
    })
  }
}
try {
  const cssOutput = join(temporary, 'tailwind.css')
  await execute(join(root, 'node_modules/.bin/tailwindcss'), ['-i', join(root, 'ui/styles.css'), '-o', cssOutput, '--minify'], { cwd: root })
  const css = await readFile(cssOutput, 'utf8')
  const compiledStyles = { name: 'maps-tailwind', setup(api) { api.onLoad({ filter: /ui\/styles\.css$/ }, () => ({ contents: css, loader: 'css', resolveDir: root })) } }
  for (const surface of ['mcp', 'workbench']) {
    const entry = surface === 'mcp' ? 'mcp-apps/map/main.tsx' : 'src/lib/remote-components/maps-workbench/src/main.tsx'
    const bundled = await build({ entryPoints: [join(root, entry)], bundle: true, write: false, outdir: temporary, format: 'iife', platform: 'browser', target: 'es2022', minify: true, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'inline', plugins: [compiledStyles, ...(surface === 'workbench' ? [globals] : [])] })
    const script = bundled.outputFiles.find(file => file.path.endsWith('.js'))?.text, style = bundled.outputFiles.find(file => file.path.endsWith('.css'))?.text
    if (!script || !style) throw new Error(`Missing ${surface} Maps assets`)
    if (surface === 'mcp') {
      const template = await readFile(join(root, 'mcp-apps/map/index.html'), 'utf8')
      const html = template.replace('<!-- APP_STYLE -->', () => `<style>${style}</style>`).replace('<!-- APP_SCRIPT -->', () => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`)
      if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw new Error('Map App exceeds host 2 MiB limit')
      outputs.set('dist/mcp-apps/map/index.html', html)
    } else {
      outputs.set('dist/lib/remote-components/maps-workbench/app.js', script)
      outputs.set('dist/lib/remote-components/maps-workbench/app.css', style)
    }
  }
  for (const [name, filename] of [['react', 'react.production.min.js'], ['react-dom', 'react-dom.production.min.js']]) {
    const packageRoot = dirname(require.resolve(`${name}/package.json`))
    outputs.set(`dist/lib/remote-components/maps-workbench/${filename}`, await readFile(join(packageRoot, 'umd', filename), 'utf8'))
  }
  for (const [path, text] of outputs) {
    const absolute = join(root, path)
    if (process.argv.includes('--check')) { if (await readFile(absolute, 'utf8') !== text) throw new Error(`Stale Maps UI: ${path}`) }
    else { await mkdir(dirname(absolute), { recursive: true }); await writeFile(absolute, text) }
  }
  console.log(`Maps React UI: MCP ${Buffer.byteLength(outputs.get('dist/mcp-apps/map/index.html'))} bytes; Workbench ${Buffer.byteLength(outputs.get('dist/lib/remote-components/maps-workbench/app.js'))} bytes`)
} finally { await rm(temporary, { recursive: true, force: true }) }
