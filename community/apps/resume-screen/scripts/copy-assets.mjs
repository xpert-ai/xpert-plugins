// 构建资产拷贝脚本：把助手模板 yaml 与远端组件 app.js 拷入 dist 产物目录
// 注意：remoteComponentName 必须与 src/lib/constants.ts 的 RESUME_SCREEN_REMOTE_ENTRY_KEY 保持一致
import { copyFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageRoot = join(__dirname, '..')

// 远端组件目录：tsc 只编译 TS，远端组件 app.js 由独立构建链产出，这里负责拷入产物
const remoteComponentName = 'resume-screen'

await mkdir(join(packageRoot, 'dist', 'lib', 'remote-components', remoteComponentName), { recursive: true })
await copyFile(
  join(packageRoot, 'src', 'xpert-resume-screen-assistant.yaml'),
  join(packageRoot, 'dist', 'xpert-resume-screen-assistant.yaml')
)

// P3 守卫：app.js 尚未构建时跳过拷贝，不阻断插件主构建
const appJs = join(packageRoot, 'src', 'lib', 'remote-components', remoteComponentName, 'app.js')
if (existsSync(appJs)) {
  await copyFile(
    appJs,
    join(packageRoot, 'dist', 'lib', 'remote-components', remoteComponentName, 'app.js')
  )
} else {
  console.log('[copy-assets] 远端组件 app.js 尚未构建，已跳过拷贝。')
}
