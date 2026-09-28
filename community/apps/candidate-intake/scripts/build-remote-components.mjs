import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const componentName = 'hr-workbench'
const sourceDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'src')
const workspaceRoot = join(packageRoot, '..', '..', '..')
const shadcnSource = join(workspaceRoot, 'packages', 'shadcn-ui', 'src', 'components', 'ui')

const shims = new Map([
  ['react', join(sourceDir, 'react-shim.ts')],
  ['react-dom', join(sourceDir, 'react-dom-shim.ts')],
  ['react-dom/client', join(sourceDir, 'react-dom-client-shim.ts')],
  ['react/jsx-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')],
  ['react/jsx-dev-runtime', join(sourceDir, 'react-jsx-runtime-shim.ts')]
])

await build({
  entryPoints: [join(sourceDir, 'main.tsx')],
  outfile: join(packageRoot, 'src', 'lib', 'remote-components', 'candidate_intake__hr_workbench', 'app.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XpertCandidateIntakeWorkbench',
  platform: 'browser',
  conditions: ['@xpert-plugins-starter/source', 'production'],
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  target: ['es2020'],
  legalComments: 'none',
  plugins: [
    {
      name: 'candidate-shadcn-source',
      setup(api) {
        api.onResolve({ filter: /^@candidate-ui\/(.+)\.js$/ }, (args) => ({
          path: join(shadcnSource, `${args.path.slice('@candidate-ui/'.length, -3)}.tsx`)
        }))
      }
    },
    {
      name: 'xpert-react-global-shims',
      setup(api) {
        api.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, args => {
          const path = shims.get(args.path)
          return path ? { path } : undefined
        })
      }
    }
  ],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' }
})
