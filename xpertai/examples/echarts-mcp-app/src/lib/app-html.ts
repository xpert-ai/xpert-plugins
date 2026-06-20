import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ECHARTS_CDN_URL = 'https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min.js'
const PACKAGE_NAME = '@xpert-ai/plugin-echarts-mcp-app'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const pluginRoot = findPluginRoot(
  moduleDir,
  process.cwd(),
  resolve(process.cwd(), 'examples/echarts-mcp-app')
)
const builtAppHtmlPath = resolve(pluginRoot, 'dist/app/index.html')

function findPluginRoot(...startDirs: string[]) {
  for (const startDir of startDirs) {
    let current = startDir

    while (current !== dirname(current)) {
      const packageJsonPath = resolve(current, 'package.json')
      if (existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
            name?: string
          }
          if (packageJson.name === PACKAGE_NAME) {
            return current
          }
        } catch {
          // Keep walking upward if this is not a readable package root.
        }
      }
      current = dirname(current)
    }
  }

  return resolve(moduleDir, '../..')
}

function readBuiltDashboardHtml() {
  if (existsSync(builtAppHtmlPath)) {
    return readFileSync(builtAppHtmlPath, 'utf8')
  }
  return null
}

function readSourceDashboardHtml() {
  const sourceAppDir = resolve(pluginRoot, 'src/app')
  const sourceIndexPath = resolve(sourceAppDir, 'index.html')
  const sourceScriptPath = resolve(sourceAppDir, 'main.ts')
  const sourceStylePath = resolve(sourceAppDir, 'styles.css')

  if (!existsSync(sourceIndexPath) || !existsSync(sourceScriptPath) || !existsSync(sourceStylePath)) {
    return null
  }

  const html = readFileSync(sourceIndexPath, 'utf8')
  const script = readFileSync(sourceScriptPath, 'utf8')
  const styles = readFileSync(sourceStylePath, 'utf8')

  return html
    .replace('<link rel="stylesheet" href="./styles.css">', `<style>\n${styles}\n</style>`)
    .replace('<script type="module" src="./main.ts"></script>', `<script type="module">\n${script}\n</script>`)
}

export function getDashboardHtml() {
  const html = readBuiltDashboardHtml() ?? readSourceDashboardHtml()
  if (!html) {
    throw new Error('ECharts MCP App asset is missing. Run the plugin build to generate dist/app/index.html.')
  }
  return html
}
