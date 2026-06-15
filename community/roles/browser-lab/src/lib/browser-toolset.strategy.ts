import { Injectable } from '@nestjs/common'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy } from '@xpert-ai/plugin-sdk'
import { XPERTAI_BROWSER_LAB_TOOLSET, xpertaiBrowserLabIcon } from './constants'
import { buildBrowserPlanTool, buildExtractLinksTool, buildSummarizeObservationTool } from './browser-tools'
import { XpertAIBrowserLabToolset } from './browser-toolset'

@Injectable()
@ToolsetStrategy(XPERTAI_BROWSER_LAB_TOOLSET)
export class XpertAIBrowserLabToolsetStrategy implements IToolsetStrategy<Record<string, never>> {
  readonly meta: IToolsetStrategy<Record<string, never>>['meta'] = {
    author: 'XpertAI Team',
    tags: ['xpertai', 'browser', 'research', 'verification'],
    name: XPERTAI_BROWSER_LAB_TOOLSET,
    label: {
      en_US: 'XpertAI Browser Lab',
      zh_Hans: 'XpertAI 浏览器实验室'
    },
    description: {
      en_US: 'Browser research planning and evidence tools for XpertAI Browser workflows.',
      zh_Hans: '受 XpertAI Browser 插件启发的浏览器调研规划与证据整理工具。'
    },
    icon: {
      type: 'svg',
      value: xpertaiBrowserLabIcon,
      color: '#2563eb'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  async validateConfig(_config: Record<string, never>): Promise<void> {
    return undefined
  }

  async create(_config: Record<string, never>): Promise<BuiltinToolset> {
    return new XpertAIBrowserLabToolset()
  }

  createTools() {
    return [buildBrowserPlanTool(), buildExtractLinksTool(), buildSummarizeObservationTool()]
  }
}
