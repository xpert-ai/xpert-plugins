import { build } from 'esbuild'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)
const ui = fileURLToPath(new URL('./dist/', import.meta.resolve('@xpert-ai/plugin-shadcn-ui/package.json')))
const out = join(root, 'dist/lib/remote-components/procurement_quote_comparison__remote')
await build({
  entryPoints: [join(root, 'remote/follow-up.jsx')],
  outfile: join(out, 'follow-up.js'),
  bundle: true,
  minify: true,
  platform: 'browser',
  format: 'iife',
  globalName: 'ProcurementFollowUp',
  alias: {
    '@xpert-ai/plugin-shadcn-ui/i18n': join(ui, 'i18n.js'),
    '@xpert-ai/plugin-shadcn-ui': join(ui, 'index.js'),
    'react/jsx-runtime': require.resolve('react/jsx-runtime')
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'iframe-react',
      setup(builder) {
        builder.onResolve({ filter: /^(react|react-dom)$/ }, (args) => ({ path: args.path, namespace: 'host' }))
        builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
          contents: 'module.exports = window.' + (args.path === 'react' ? 'React' : 'ReactDOM')
        }))
      }
    }
  ]
})
await copyFile(join(ui, 'style.css'), join(out, 'follow-up.css'))
