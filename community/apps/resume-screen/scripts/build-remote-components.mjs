// 远端组件构建脚本（复制自 crm 样板并改造，蓝图 §10 P1）
// 变更点：componentName=resume-screen、globalName=XpertResumeScreen；
// 构建后把所用 remixicon 图标的 @font-face(woff2 base64)+类子集追加进 esbuild 产出的
// app.css——iframe 壳只内联 app.js 与 app.css（provider 经 appCss 通道注入），
// 若不随产物打包字体，`<i class="ri-*">` 在 iframe 内无字形可渲染（P1 实现前提）。
import { build } from 'esbuild'
import { existsSync } from 'fs'
import { readdir, readFile, writeFile } from 'fs/promises'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')
const componentName = 'resume-screen'
const sourceDir = join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'src')
const appCssPath = join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.css')
const requireFromPackage = createRequire(join(packageRoot, 'package.json'))

function resolveWorkspaceSourcePackage(packageName, relativeEntry) {
  let current = packageRoot
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(current, relativeEntry)
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) {
      break
    }
    current = parent
  }

  try {
    return requireFromPackage.resolve(packageName)
  } catch {
    return null
  }
  return null
}

function workspaceSourcePackagePlugin() {
  const shadcnUiEntry = resolveWorkspaceSourcePackage(
    '@xpert-ai/plugin-shadcn-ui',
    join('packages', 'shadcn-ui', 'dist', 'index.js')
  )

  return {
    name: 'xpert-workspace-source-packages',
    setup(buildApi) {
      if (shadcnUiEntry) {
        buildApi.onResolve({ filter: /^@xpert-ai\/plugin-shadcn-ui$/ }, () => ({ path: shadcnUiEntry }))
      }
    }
  }
}

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
  outfile: join(packageRoot, 'src', 'lib', 'remote-components', componentName, 'app.js'),
  bundle: true,
  format: 'iife',
  globalName: 'XpertResumeScreen',
  platform: 'browser',
  conditions: ['@xpert-plugins-starter/source', 'production'],
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcemap: false,
  minify: false,
  target: ['es2020'],
  legalComments: 'none',
  plugins: [workspaceSourcePackagePlugin(), reactShimPlugin()],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.IS_PREACT': '"false"'
  }
})

// ===== remixicon 子集注入（P1 交付通道） =====

async function collectUsedIconClasses() {
  // 递归扫描组件源码，收集代码中出现的 ri-* 图标类名（manifest 图标同名，U2 约束）
  const names = new Set()
  const pattern = /ri-[a-z0-9]+(?:-[a-z0-9]+)*/g
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      const text = await readFile(full, 'utf8')
      for (const match of text.matchAll(pattern)) names.add(match[0])
    }
  }
  await walk(sourceDir)
  return names
}

async function buildRemixiconSubsetCss() {
  let remixRoot
  try {
    remixRoot = dirname(requireFromPackage.resolve('remixicon/package.json'))
  } catch {
    console.warn('[remote-css] 未找到 remixicon 依赖，跳过图标字体注入（iframe 内 ri-* 类将无字形）')
    return ''
  }
  const cssPath = join(remixRoot, 'fonts', 'remixicon.css')
  const woff2Path = join(remixRoot, 'fonts', 'remixicon.woff2')
  if (!existsSync(cssPath) || !existsSync(woff2Path)) {
    console.warn('[remote-css] remixicon 字体产物缺失，跳过注入')
    return ''
  }
  const used = await collectUsedIconClasses()
  if (!used.size) return ''
  const fullCss = await readFile(cssPath, 'utf8')
  // 逐条保留用到的 `:before` 规则（remixicon 规则成对选择器，整块拷贝保持与原 css 一致）
  const rules = []
  const ruleRe = /\.ri-[a-z0-9-]+:before[^{]*\{[^}]*\}/g
  for (const match of fullCss.matchAll(ruleRe)) {
    const className = match[0].slice(1).split(':')[0]
    if (used.has(className)) rules.push(match[0])
  }
  const missing = [...used].filter((name) => !rules.some((rule) => rule.includes(`.${name}:`)))
  if (missing.length) {
    console.warn(`[remote-css] 以下图标类在 remixicon.css 中未命中，检查拼写：${missing.join(', ')}`)
  }
  const woff2 = await readFile(woff2Path)
  // woff2 以 base64 内联：iframe 壳是内联 <style>，相对字体 URL 不可达（P1 根因）
  const base64 = woff2.toString('base64')
  return [
    '/* remixicon subset (Remix Icon License 1.0, npm remixicon@4.9.1) —— 蓝图 §10 P1 交付通道 */',
    "@font-face{font-family:'remixicon';src:url(data:font/woff2;base64," + base64 + ')format("woff2");font-weight:normal;font-style:normal;font-display:swap;}',
    '[class^="ri-"], [class*=" ri-"]{font-family:"remixicon"!important;font-style:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}',
    ...rules
  ].join('\n')
}

// esbuild 只有在入口链上有 CSS import 时才会产出兄弟 app.css；无产物时不强行创建
let appCssText = existsSync(appCssPath) ? await readFile(appCssPath, 'utf8') : ''
const remixCss = await buildRemixiconSubsetCss()
if (remixCss) {
  appCssText = appCssText ? `${appCssText}\n${remixCss}\n` : `${remixCss}\n`
  await writeFile(appCssPath, appCssText, 'utf8')
  console.log('[remote-css] remixicon 图标子集已注入 app.css')
}
