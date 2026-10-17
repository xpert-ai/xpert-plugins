import { readFileSync } from 'node:fs'
import { XpertServerPlugin, type XpertPlugin } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SaicConnections, SaicDataSourcesController, dorisFactoryProvider } from './lib/connections.js'
import { SaicDorisTools } from './lib/provider.js'
import { saicTemplates } from './lib/templates.js'
@XpertServerPlugin({
  providers: [SaicConnections, dorisFactoryProvider, SaicDorisTools],
  controllers: [SaicDataSourcesController],
  exports: [SaicDorisTools]
})
export class SaicDorisPlugin {}
const metadata = z
  .object({ name: z.string(), version: z.string() })
  .parse(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')))
const plugin: XpertPlugin = {
  meta: {
    ...metadata,
    level: 'tenant',
    artifactNamespace: 'saic_doris',
    category: 'tools',
    displayName: 'SAIC Doris',
    description: 'SAIC supply-chain configuration middleware and native MCP',
    author: 'XpertAI',
    keywords: ['doris', 'saic', 'mcp'],
    targetApps: ['xpert'],
    targetAppMeta: {
      xpert: {
        types: ['assistant-template', 'middleware', 'toolset', 'mcp'],
        marketplace: {
          contents: [
            {
              type: 'assistant-template',
              name: saicTemplates[0].key,
              displayName: 'SAIC 供应链配置助手',
              description: '预置 SAIC Doris 中间件的专家模板，支持平台数据源和手填连接。'
            },
            {
              type: 'middleware',
              name: 'saic_doris',
              displayName: 'SAIC Doris',
              description: '24 supply-chain configuration tools with a platform or manual Doris connection'
            },
            {
              type: 'mcp',
              name: 'saic-doris',
              displayName: 'SAIC Doris MCP',
              description: '24 tools and configuration schema',
              metadata: { protocol: 'native', provider: 'saic_doris' }
            }
          ]
        }
      }
    }
  },
  templates: saicTemplates,
  config: { schema: z.object({}).strict() },
  register() {
    return { module: SaicDorisPlugin }
  }
}
export default plugin
export { SaicDorisTools }
