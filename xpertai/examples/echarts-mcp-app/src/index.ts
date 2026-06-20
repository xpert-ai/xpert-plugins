import type { XpertPlugin } from '@xpert-ai/plugin-sdk'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { EChartsMcpAppPlugin } from './lib/plugin.js'
import { icon } from './lib/icon.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as {
  name: string
  version: string
}

const ConfigSchema = z.object({})

const targetAppMetadata = {
  targetApps: ['xpert'],
  targetAppMeta: {
    xpert: {
      types: ['mcp-server', 'tool', 'demo'],
      capabilities: ['mcp-apps', 'echarts', 'drilldown-analysis']
    }
  }
}

const plugin: XpertPlugin<z.infer<typeof ConfigSchema>> = {
  meta: {
    name: packageJson.name,
    version: packageJson.version,
    category: 'tools',
    ...targetAppMetadata,
    icon: {
      type: 'svg',
      value: icon
    },
    displayName: 'ECharts MCP App',
    description: 'Interactive ECharts dashboard demo for testing MCP Apps in ChatKit.',
    keywords: ['mcp', 'apps', 'echarts', 'chatkit', 'drilldown'],
    author: 'XpertAI Team'
  },
  config: {
    schema: ConfigSchema
  },
  register(ctx) {
    ctx.logger.log('register ECharts MCP App plugin')
    return { module: EChartsMcpAppPlugin, global: true }
  },
  async onStart(ctx) {
    ctx.logger.log('ECharts MCP App plugin started')
  },
  async onStop(ctx) {
    ctx.logger.log('ECharts MCP App plugin stopped')
  }
}

export default plugin
