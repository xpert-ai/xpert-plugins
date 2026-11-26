import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
// Shared controls and the view must use the same React that the SDK put in the iframe.
const hostReact = {
  name: 'host-react',
  setup(builder) {
    builder.onResolve({ filter: /^(react|react-dom)(\/client)?$/ }, ({ path }) => ({ path, namespace: 'host-runtime' }))
    builder.onLoad({ filter: /.*/, namespace: 'host-runtime' }, ({ path }) => ({
      contents: path === 'react' ? 'module.exports = globalThis.React' : 'module.exports = globalThis.ReactDOM'
    }))
  }
}
await build({
  absWorkingDir: root,
  entryPoints: ['remote/main.tsx'],
  outfile: 'dist/remote/workbench.js',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [hostReact]
})
