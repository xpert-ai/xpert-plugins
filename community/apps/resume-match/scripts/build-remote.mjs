import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const component = join(root, 'src/lib/remote-components/resume-match')
const shims = join(component, 'src/shims')
const shared = resolve(root, '../../../packages/shadcn-ui')
const aliases = {
  react: join(shims, 'react-shim.ts'),
  'react-dom': join(shims, 'react-dom-shim.ts'),
  'react-dom/client': join(shims, 'react-dom-client-shim.ts'),
  'react/jsx-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  'react/jsx-dev-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  '@xpert-ai/plugin-shadcn-ui': join(shared, 'dist/index.js'),
  '@xpert-ai/plugin-shadcn-ui/theme': join(shared, 'dist/theme.js'),
  '@xpert-ai/plugin-shadcn-ui/style.css': join(shared, 'dist/style.css')
}

const result = await build({
  entryPoints: [join(component, 'src/main.tsx')],
  outdir: component,
  entryNames: 'app',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'host-runtime',
      setup(build) {
        build.onResolve(
          { filter: /^(react($|\/)|react-dom($|\/)|@xpert-ai\/plugin-shadcn-ui($|\/))/ },
          (args) => (aliases[args.path] ? { path: aliases[args.path] } : undefined)
        )
      }
    }
  ]
})

const js = (result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '').replace(/^[ \t]+$/gm, '')
const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? ''
const base = '\n@layer base { *,::before,::after,::backdrop,::file-selector-button { border-color: var(--border,var(--xui-color-border,#e4e4e7)); } }\n'
for (const [name, content] of [
  ['app.js', js],
  ['app.css', css + base]
]) {
  const target = join(component, name)
  if (process.argv.includes('--check')) {
    const current = await readFile(target, 'utf8').catch(() => '')
    if (current !== content) throw new Error(`Stale generated asset: ${name}`)
  } else {
    await writeFile(target, content)
  }
}
console.log(process.argv.includes('--check') ? '远程组件产物已是最新' : '远程组件产物已生成')
