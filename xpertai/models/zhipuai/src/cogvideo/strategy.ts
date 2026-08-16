import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  IToolsetStrategy,
  ToolsetStrategy,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { SvgIcon } from '../types.js'
import { buildZhipuCogVideoTools } from './tools.js'
import { ZhipuCogVideoToolset } from './toolset.js'
import {
  ZhipuCogVideo,
  type ZhipuCogVideoCredentials
} from './types.js'

type ToolsetConfig = {
  name?: string
  type?: string
  credentials: ZhipuCogVideoCredentials
}

@Injectable()
@ToolsetStrategy(ZhipuCogVideo)
export class ZhipuCogVideoStrategy implements IToolsetStrategy<ZhipuCogVideoCredentials> {
  readonly meta: IToolsetStrategy<ZhipuCogVideoCredentials>['meta'] = {
    author: 'XpertAI Team',
    tags: ['creativity', 'productivity'],
    name: ZhipuCogVideo,
    label: {
      en_US: 'ZhipuAI CogVideo',
      zh_Hans: '智谱 CogVideo 视频生成'
    },
    description: {
      en_US: 'Generate videos from text or images with ZhipuAI CogVideoX models.',
      zh_Hans: '使用智谱 CogVideoX 模型根据文本或图片生成视频。'
    },
    icon: {
      type: 'svg',
      value: SvgIcon,
      color: '#2468F2'
    },
    configSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {}

  async validateConfig(config: ZhipuCogVideoCredentials): Promise<void> {
    void config
  }

  async create(
    config: ZhipuCogVideoCredentials | ToolsetConfig,
    params?: TBuiltinToolsetParams
  ): Promise<BuiltinToolset> {
    return new ZhipuCogVideoToolset(toToolset(config), this.runtimeCapabilities, params)
  }

  createTools(): any {
    return buildZhipuCogVideoTools({
      workspaceFiles: {
        uploadBuffer: async () => {
          throw new Error('Xpert workspace file runtime capability is required for ZhipuAI video outputs.')
        },
        readBuffer: async () => {
          throw new Error('Xpert workspace file runtime capability is required for ZhipuAI image inputs.')
        }
      }
    })
  }
}

function toToolset(config: ZhipuCogVideoCredentials | ToolsetConfig): ToolsetConfig {
  if ('credentials' in config) return config
  return {
    name: ZhipuCogVideo,
    type: ZhipuCogVideo,
    credentials: config
  }
}
