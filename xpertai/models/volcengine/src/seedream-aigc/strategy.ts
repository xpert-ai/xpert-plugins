import { Inject, Injectable, Optional } from '@nestjs/common'
import { BuiltinToolset, IToolsetStrategy, ToolsetStrategy, type TBuiltinToolsetParams } from '@xpert-ai/plugin-sdk'
import { SvgIcon } from '../types.js'
import { buildSeedreamTools } from './tools.js'
import { SeedreamAigc, type RuntimeCapabilityRegistryLike } from './types.js'
import { SeedreamAigcToolset } from './toolset.js'

const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'

@Injectable()
@ToolsetStrategy(SeedreamAigc)
export class SeedreamAigcStrategy implements IToolsetStrategy<any> {
  meta = {
    author: 'Xpert AI',
    tags: ['image', 'video', 'aigc', 'seedream', 'seedance', 'volcengine'],
    name: SeedreamAigc,
    label: {
      en_US: 'Seedream AIGC',
      zh_Hans: '即梦 AIGC'
    },
    description: {
      en_US: 'Generate and edit images and videos with Volcengine Ark Seedream and Seedance models.',
      zh_Hans: '通过火山方舟即梦 Seedream 和 Seedance 模型生成、编辑图片和视频。'
    },
    icon: {
      type: 'svg' as any,
      value: SvgIcon,
      color: '#006EFF'
    },
    configSchema: {
      type: 'object',
      properties: {
        ark_api_key: {
          type: 'string',
          title: 'Volcengine API Key',
          secret: true
        },
        api_endpoint_host: {
          type: 'string',
          title: 'API endpoint host',
          default: 'https://ark.cn-beijing.volces.com/api/v3'
        }
      },
      required: ['ark_api_key']
    }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike
  ) {}

  async validateConfig(config: any): Promise<void> {
    if (!config?.ark_api_key) {
      throw new Error('Ark API key is missing')
    }
  }

  async create(config: any, params?: TBuiltinToolsetParams): Promise<BuiltinToolset> {
    return new SeedreamAigcToolset(config, this.runtimeCapabilities, params)
  }

  createTools(): any {
    // plugin-sdk 3.9.1 still types tool schemas as Zod-only; Seedream image tools use LangChain-supported JSON Schema.
    return buildSeedreamTools({
      credentials: {},
      workspaceFiles: {
        uploadBuffer: async () => {
          throw new Error('Xpert workspace file runtime capability is required for Seedream AIGC outputs.')
        },
        readBuffer: async () => {
          throw new Error('Not implemented')
        },
        deleteFile: async () => {
          throw new Error('Not implemented')
        }
      }
    })
  }
}
