import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  type IToolsetStrategy,
  ToolsetStrategy,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import type { MiniMaxCredentials } from '../types.js'
import { MiniMaxVideoToolset, type MiniMaxVideoToolsetDescriptor } from './toolset.js'
import { buildMiniMaxVideoTools } from './tools.js'
import { MiniMaxVideo } from './types.js'

type ToolsetConfig = {
  name?: string
  type?: string
  credentials: MiniMaxCredentials
}

@Injectable()
@ToolsetStrategy(MiniMaxVideo)
export class MiniMaxVideoStrategy implements IToolsetStrategy<MiniMaxCredentials> {
  readonly meta: IToolsetStrategy<MiniMaxCredentials>['meta'] = {
    author: 'XpertAI Team',
    tags: ['creativity', 'productivity'],
    name: MiniMaxVideo,
    label: { en_US: 'MiniMax H3 Video', zh_Hans: 'MiniMax H3 视频生成' },
    description: {
      en_US: 'Generate videos from text or first/last frame images with MiniMax H3.',
      zh_Hans: '使用 MiniMax H3 根据文本或首尾帧图片生成视频。'
    },
    icon: {
      type: 'svg',
      value: '<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#EFF3FF"/><path d="M6 8.5A2.5 2.5 0 0 1 8.5 6h5A2.5 2.5 0 0 1 16 8.5v1.2l2.2-1.4c.8-.5 1.8.1 1.8 1v5.4c0 .9-1 1.5-1.8 1L16 14.3v1.2a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 6 15.5v-7Z" fill="#405CF5"/></svg>',
      color: '#405CF5'
    },
    configSchema: { type: 'object', additionalProperties: false, properties: {} }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {}

  async validateConfig(config: MiniMaxCredentials): Promise<void> {
    void config
  }

  async create(
    config: MiniMaxCredentials | ToolsetConfig,
    params?: TBuiltinToolsetParams
  ): Promise<BuiltinToolset> {
    return new MiniMaxVideoToolset(toToolset(config), this.runtimeCapabilities, params)
  }

  createTools(): any {
    return buildMiniMaxVideoTools({
      workspaceFiles: {
        uploadBuffer: async () => { throw new Error('Workspace files are required') },
        readBuffer: async () => { throw new Error('Workspace files are required') }
      }
    })
  }
}

function toToolset(config: MiniMaxCredentials | ToolsetConfig): MiniMaxVideoToolsetDescriptor {
  if ('credentials' in config) return config
  return { name: MiniMaxVideo, type: MiniMaxVideo, credentials: config }
}
