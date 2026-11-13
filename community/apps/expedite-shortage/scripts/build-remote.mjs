// 用 esbuild 把 TSX 界面打包成 iframe 运行时读取的 app.js / app.css。
// React 不打进包里：通过 shim 指向宿主注入的 window.React / window.ReactDOM。
// 加 --check 时只校验：重新构建的结果必须与已提交的 app.js / app.css 完全一致（防止改了 TSX 忘了重新构建）。
// 写法参考 community/apps/material-identity-governance/scripts/build-remote.mjs（AGPL-3.0），去掉了 Tailwind 和 shadcn。
import { build } from 'esbuild'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const entryDir = join(root, 'src/lib/remote-components/expedite-workbench')
const shims = join(entryDir, 'src/shims')
const aliases = {
  react: join(shims, 'react-shim.ts'),
  'react-dom/client': join(shims, 'react-dom-client-shim.ts'),
  'react/jsx-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  'react/jsx-dev-runtime': join(shims, 'react-jsx-runtime-shim.ts')
}

const result = await build({
  entryPoints: [join(entryDir, 'src/main.tsx')],
  outdir: entryDir,
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
      name: 'host-react',
      setup(builder) {
        builder.onResolve({ filter: /^react(-dom)?($|\/)/ }, (args) => (aliases[args.path] ? { path: aliases[args.path] } : undefined))
      }
    }
  ]
})

const outputs = {
  'app.js': result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '',
  'app.css': result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? ''
}
for (const [name, content] of Object.entries(outputs)) {
  const target = join(entryDir, name)
  if (check) {
    const current = await readFile(target, 'utf8').catch(() => '')
    if (current !== content) throw new Error(`Stale generated remote asset: ${name}. Run the build.`)
  } else {
    await writeFile(target, content)
  }
}
console.log(check ? 'Remote assets are current.' : `Remote assets generated (app.js ${outputs['app.js'].length} bytes).`)
