import { build } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const out = join(root, 'dist/remote')
await mkdir(out, { recursive: true })
await build({
  entryPoints: [join(root, 'remote/main.tsx')],
  outfile: join(out, 'app.js'),
  bundle: true, platform: 'browser', format: 'iife', minify: true, target: 'es2022', jsx: 'automatic',
  alias: {
    'react/jsx-runtime': require.resolve('react/jsx-runtime'),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    name: 'host-react',
    setup(builder) {
      builder.onResolve({ filter: /^(react|react-dom|react-dom\/client)$/ }, ({ path }) => ({
        path, namespace: 'host-react',
      }))
      builder.onLoad({ filter: /.*/, namespace: 'host-react' }, ({ path }) => ({
        contents: 'module.exports = window.' + (path === 'react' ? 'React' : 'ReactDOM'),
      }))
    },
  }],
})
await Promise.all([
  copyFile(join(root, 'src/assistant.yaml'), join(root, 'dist/assistant.yaml')),
  ...['react', 'react-dom'].map((name) => copyFile(
    join(dirname(require.resolve(name + '/package.json')), 'umd', name + '.production.min.js'),
    join(out, name + '.js')
  )),
])
