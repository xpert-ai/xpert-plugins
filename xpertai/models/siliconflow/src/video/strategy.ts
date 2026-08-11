import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  IToolsetStrategy,
  ToolsetStrategy,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { buildSiliconflowVideoTools } from './tools.js'
import { SiliconflowVideoToolset, type RuntimeCapabilityRegistryLike } from './toolset.js'
import {
  SiliconflowVideo,
  SiliconflowVideoDefaultBaseUrl,
  type SiliconflowVideoCredentials
} from './types.js'

type ToolsetConfig = {
  name?: string
  type?: string
  credentials: SiliconflowVideoCredentials
}

const SiliconflowVideoIcon = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="24" height="24" rx="6" fill="#FFE7FF"/>
  <path d="M6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18H8.2V14.8H12C13.5464 14.8 14.8 13.5464 14.8 12C14.8 10.4536 13.5464 9.2 12 9.2C10.4536 9.2 9.2 10.4536 9.2 12V13.4H6V12Z" fill="#E11D8D"/>
</svg>`

@Injectable()
@ToolsetStrategy(SiliconflowVideo)
export class SiliconflowVideoStrategy implements IToolsetStrategy<SiliconflowVideoCredentials> {
  readonly meta: IToolsetStrategy<SiliconflowVideoCredentials>['meta'] = {
    author: 'XpertAI Team',
    tags: ['creativity', 'productivity'],
    name: SiliconflowVideo,
    label: {
      en_US: 'SiliconFlow Video',
      zh_Hans: '硅基流动视频生成'
    },
    description: {
      en_US: 'Generate videos from text or images with SiliconFlow Wan2.2 models.',
      zh_Hans: '使用硅基流动 Wan2.2 模型根据文本或图片生成视频。'
    },
    icon: {
      type: 'svg',
      value: SiliconflowVideoIcon,
      color: '#E11D8D'
    },
    configSchema: {
      type: 'object',
      properties: {
        api_key: {
          type: 'string',
          title: {
            en_US: 'SiliconFlow API key',
            zh_Hans: '硅基流动 API Key'
          },
          description: {
            en_US: 'API key from the SiliconFlow platform.',
            zh_Hans: '硅基流动平台提供的 API Key。'
          },
          'x-ui': {
            component: 'secretInput'
          }
        },
        endpoint_url: {
          type: 'string',
          title: {
            en_US: 'API endpoint',
            zh_Hans: 'API 地址'
          },
          description: {
            en_US: 'SiliconFlow video API base URL.',
            zh_Hans: '硅基流动视频 API 基础地址。'
          },
          default: SiliconflowVideoDefaultBaseUrl
        }
      },
      required: ['api_key']
    }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike
  ) {}

  async validateConfig(config: SiliconflowVideoCredentials): Promise<void> {
    if (!config.api_key?.trim()) throw new Error('SiliconFlow API key is missing')
  }

  async create(
    config: SiliconflowVideoCredentials | ToolsetConfig,
    params?: TBuiltinToolsetParams
  ): Promise<BuiltinToolset> {
    return new SiliconflowVideoToolset(toToolset(config), this.runtimeCapabilities, params)
  }

  createTools(): any {
    return buildSiliconflowVideoTools({
      credentials: {},
      workspaceFiles: {
        uploadBuffer: async () => {
          throw new Error('Xpert workspace file runtime capability is required for SiliconFlow video outputs.')
        },
        readBuffer: async () => {
          throw new Error('Xpert workspace file runtime capability is required for SiliconFlow image inputs.')
        }
      }
    })
  }
}

function toToolset(config: SiliconflowVideoCredentials | ToolsetConfig): ToolsetConfig {
  if ('credentials' in config) return config
  return {
    name: SiliconflowVideo,
    type: SiliconflowVideo,
    credentials: config
  }
}
