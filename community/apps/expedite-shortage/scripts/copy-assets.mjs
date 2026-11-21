// 把 tsc 不会处理的运行时资源（助手模板 yaml、界面 app.js/app.css）复制进 dist。
// 加 --check 参数时只做校验：dist 中的资源必须存在且与源码逐字节一致，防止“改了源码忘了重新构建”。
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const check = process.argv.includes('--check')

/** 需要随包发布的资源：[源文件, dist 中的目标位置]（相对包根目录）；后续阶段在这里追加 */
const ASSETS = [
  ['src/expedite-shortage-assistant.yaml', 'dist/expedite-shortage-assistant.yaml'],
  ['src/lib/remote-components/expedite-workbench/app.js', 'dist/lib/remote-components/expedite-workbench/app.js'],
  ['src/lib/remote-components/expedite-workbench/app.css', 'dist/lib/remote-components/expedite-workbench/app.css']
]

for (const [from, to] of ASSETS) {
  const source = await readFile(resolve(root, from))
  const target = resolve(root, to)
  if (check) {
    const current = await readFile(target).catch(() => null)
    if (!current || !source.equals(current)) throw new Error(`Stale or missing dist asset: ${to}`)
  } else {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, source)
  }
}

// 入口文件必须存在
for (const file of ['dist/index.js', 'dist/index.d.ts']) await stat(resolve(root, file))

console.log(check ? `Dist assets verified (${ASSETS.length}).` : `Dist assets copied (${ASSETS.length}).`)
