import type { DynamicStructuredTool } from '@langchain/core/tools'
import type { IXpertToolset } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  ToolsetStrategy,
  type BuiltinToolset,
  type IToolsetStrategy,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import type { ZodSchema } from 'zod'
import { CUT_ICON, CUT_TOOLSET_PROVIDER_KEY } from './constants.js'
import { CutMiddleware } from './cut.middleware.js'
import { CutNativeToolset } from './cut-native-capabilities.js'

@Injectable()
@ToolsetStrategy(CUT_TOOLSET_PROVIDER_KEY)
export class CutToolsetStrategy implements IToolsetStrategy<IXpertToolset> {
  readonly meta = {
    author: 'XpertAI Team',
    tags: ['cut', 'video', 'timeline', 'mcp'],
    name: CUT_TOOLSET_PROVIDER_KEY,
    label: { en_US: 'Cut', zh_Hans: 'Cut 视频剪辑' },
    description: {
      en_US: 'Native Cut project, media, timeline, caption, proposal, and export capabilities.',
      zh_Hans: 'Cut 项目、素材、时间线、字幕、提案和导出的宿主原生能力。'
    },
    icon: { type: 'svg' as const, value: CUT_ICON, color: '#0ea5e9' },
    configSchema: { type: 'object', properties: {}, required: [] }
  }

  constructor(private readonly middleware: CutMiddleware) {}

  async validateConfig(): Promise<void> {}

  async create(toolset: IXpertToolset, params?: TBuiltinToolsetParams): Promise<BuiltinToolset> {
    return new CutNativeToolset(toolset, params, this.middleware)
  }

  createTools(): DynamicStructuredTool<ZodSchema>[] {
    return []
  }
}
