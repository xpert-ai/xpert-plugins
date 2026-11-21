// 用 esbuild 把 TSX 界面打包成 iframe 运行时读取的 app.js / app.css。
// - React 不打进包里：通过 shim 指向宿主注入的 window.React / window.ReactDOM。
// - shadcn 组件来自仓库根目录的 packages/shadcn-ui（构建期依赖，打进 app.js，运行时不依赖它）；
//   要先在 packages/shadcn-ui 里执行一次 `pnpm build` 生成 dist。
// - 本插件自己用到的 Tailwind 布局类，用 Tailwind CLI 按 scripts/tailwind.css 扫描 TSX 生成，拼在 app.css 末尾。
// 加 --check 时只校验：重新构建的结果必须与已提交的 app.js / app.css 完全一致（防止改了 TSX 忘了重新构建）。
// 写法参考 community/apps/material-identity-governance/scripts/build-remote.mjs（AGPL-3.0）。
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')
const entryDir = join(root, 'src/lib/remote-components/expedite-workbench')
const shims = join(entryDir, 'src/shims')
const shared = resolve(root, '../../..', 'packages/shadcn-ui')

await stat(join(shared, 'dist/index.js')).catch(() => {
  throw new Error('packages/shadcn-ui/dist is missing. Run `pnpm build` in packages/shadcn-ui first.')
})

const aliases = {
  react: join(shims, 'react-shim.ts'),
  'react-dom': join(shims, 'react-dom-shim.ts'),
  'react-dom/client': join(shims, 'react-dom-client-shim.ts'),
  'react/jsx-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  'react/jsx-dev-runtime': join(shims, 'react-jsx-runtime-shim.ts'),
  '@xpert-ai/plugin-shadcn-ui': join(shared, 'dist/index.js'),
  '@xpert-ai/plugin-shadcn-ui/style.css': join(shared, 'dist/style.css')
}

// 1) Tailwind：生成本插件用到的工具类
const temporary = await mkdtemp(join(tmpdir(), 'expedite-shortage-css-'))
const utilitiesFile = join(temporary, 'utilities.css')
const tailwind = spawnSync('corepack', ['pnpm', 'exec', 'tailwindcss', '-i', join(root, 'scripts/tailwind.css'), '-o', utilitiesFile, '--minify'], {
  cwd: root,
  encoding: 'utf8'
})
if (tailwind.status !== 0) throw new Error(tailwind.stderr || 'tailwind_failed')
const utilities = await readFile(utilitiesFile, 'utf8')
await rm(temporary, { recursive: true, force: true })

// 2) esbuild：打包 TSX + shadcn
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
      name: 'host-runtime',
      setup(builder) {
        builder.onResolve({ filter: /^(react($|\/)|react-dom($|\/)|@xpert-ai\/plugin-shadcn-ui($|\/))/ }, (args) =>
          aliases[args.path] ? { path: aliases[args.path] } : undefined
        )
      }
    }
  ]
})

const bundledCss = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? ''
const outputs = {
  'app.js': result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '',
  // 边框默认颜色跟随主题变量（Tailwind v4 的默认边框色是 currentColor）
  'app.css': `${bundledCss}\n${utilities}\n@layer base { *,::before,::after,::backdrop,::file-selector-button { border-color: var(--border, var(--xui-color-border, #e4e4e7)); } }`
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
