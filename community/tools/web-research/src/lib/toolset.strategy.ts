import { Injectable } from '@nestjs/common'
import { StructuredToolInterface, ToolSchemaBase } from '@langchain/core/tools'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { buildWebScrapeTool, buildWebSearchTool } from './tool'
import { FirecrawlConfig, WebResearch, svg } from './types'

@Injectable()
@ToolsetStrategy(WebResearch)
export class WebResearchStrategy implements IToolsetStrategy<FirecrawlConfig> {
  readonly meta: IToolsetStrategy<FirecrawlConfig>['meta'] = {
    author: 'Xpert AI', tags: ['web', 'search', 'scrape', 'firecrawl'], name: WebResearch,
    label: { en_US: 'Web research', zh_Hans: '网页搜索与抓取' },
    description: { en_US: 'Search the web and scrape public pages through Firecrawl.', zh_Hans: '通过 Firecrawl 搜索网页并抓取公开页面。' },
    icon: { type: 'svg', value: svg, color: '#2563eb' },
    configSchema: { type: 'object', properties: {
      apiKey: { type: 'string', title: 'Firecrawl API Key', 'x-ui': { component: 'secretInput', label: 'Firecrawl API Key', revealable: true, maskSymbol: '*', persist: true } },
      apiUrl: { type: 'string', title: 'Firecrawl API URL', default: 'https://api.firecrawl.dev/v2' }
    }, required: ['apiKey'] }
  }
  async validateConfig(config: FirecrawlConfig): Promise<void> {
    if (!config?.apiKey?.trim()) throw new Error('A Firecrawl API key is required.')
    if (config.apiUrl && !/^https:\/\//.test(config.apiUrl)) throw new Error('Firecrawl API URL must use HTTPS.')
  }
  async create(config: FirecrawlConfig): Promise<BuiltinToolset> { await this.validateConfig(config); return new WebResearchToolset(config) }
  createTools() { return [buildWebSearchTool({ apiKey: '' }), buildWebScrapeTool({ apiKey: '' })] }
}

export class WebResearchToolset extends BuiltinToolset {
  constructor(private readonly config: FirecrawlConfig) { super(WebResearch) }
  override async initTools(): Promise<StructuredToolInterface<ToolSchemaBase, any, any>[]> {
    this.tools = [buildWebSearchTool(this.config), buildWebScrapeTool(this.config)]
    return this.tools
  }
}
