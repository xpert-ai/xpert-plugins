import { build } from 'esbuild'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const componentName = 'support-ticket'
const sourceDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'src')

function reactShimPlugin() {
  const shims = new Map([
    ['react', join(sourceDir, 'react-shim.ts')],
    ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
    ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
    ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
    ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
  ])

  return {
    name: 'xpert-react-global-shims',
    setup(buildApi) {
      buildApi.onResolve(
        { filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ },
        (args) => {
          const path = shims.get(args.path)
          return path ? { path } : undefined
        }
      )
    }
  }
}

await build({
  entryPoints: [join(sourceDir, 'main.tsx')],
  outfile: join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XpertSupportTicketWorkbench',
  platform: 'browser',
  conditions: ['@xpert-plugins-starter/source', 'production'],
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcemap: false,
  minify: false,
  target: ['es2020'],
  legalComments: 'none',
  plugins: [reactShimPlugin()],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': '"false"'
  }
})
