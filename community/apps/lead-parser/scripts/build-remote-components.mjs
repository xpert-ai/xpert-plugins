import { build } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const componentName = 'lead-parser-workbench'
const componentDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName)
const sourceDir = join(componentDir, 'src')

/**
 * iframe 里的 React/ReactDOM 来自宿主注入的 UMD 全局变量，
 * 因此打包时把 react 相关 import 重定向到 shim 文件。
 */
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
      buildApi.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime|react\/jsx-dev-runtime)$/ }, (args) => {
        const path = shims.get(args.path)
        return path ? { path } : undefined
      })
    }
  }
}

await build({
  entryPoints: [join(sourceDir, 'main.tsx')],
  outfile: join(componentDir, 'app.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XpertLeadParserWorkbench',
  platform: 'browser',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcemap: false,
  minify: false,
  target: ['es2020'],
  legalComments: 'none',
  plugins: [reactShimPlugin()],
  define: {
    'process.env.NODE_ENV': '"production"'
  }
})

// 同步产物到 dist（ViewProvider 运行时在 dist/lib 下读取）
const distDir = join(packageRoot, 'dist', 'lib', 'remote-components', componentName)
if (existsSync(join(packageRoot, 'dist', 'lib'))) {
  mkdirSync(distDir, { recursive: true })
  copyFileSync(join(componentDir, 'app.js'), join(distDir, 'app.js'))
  copyFileSync(join(componentDir, 'app.css'), join(distDir, 'app.css'))
  console.log(`[lead-parser] app.js / app.css copied to ${distDir}`)
}

console.log(`[lead-parser] remote component built: ${join(componentDir, 'app.js')}`)
