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
    videoGeneration: {
      protocolVersion: 2 as const,
      family: 'seedance' as const,
      displayName: 'Seedance',
      modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'] as const,
      tools: {
        textToVideo: 'seedance_text_to_video',
        imageToVideo: 'seedance_image_to_video',
        firstLastFrameToVideo: 'seedance_first_last_frame_to_video',
        referenceToVideo: 'seedance_multimodal_reference_to_video',
        query: 'seedance_video_query'
      },
      models: [
        {
          id: 'doubao-seedance-2-5-260628',
          label: 'Seedance 2.5',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
          inputs: {
            referenceImages: { maxItems: 30 },
            referenceVideos: { maxItems: 10 },
            referenceAudios: { maxItems: 10 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-2-0-260128',
          label: 'Seedance 2.0',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
          inputs: {
            referenceImages: { maxItems: 9 },
            referenceVideos: { maxItems: 3 },
            referenceAudios: { maxItems: 3 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-2-0-fast-260128',
          label: 'Seedance 2.0 Fast',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
          inputs: {
            referenceImages: { maxItems: 9 },
            referenceVideos: { maxItems: 3 },
            referenceAudios: { maxItems: 3 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-2-0-mini-260615',
          label: 'Seedance 2.0 Mini',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
          inputs: {
            referenceImages: { maxItems: 9 },
            referenceVideos: { maxItems: 3 },
            referenceAudios: { maxItems: 3 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-1-5-pro-251215',
          label: 'Seedance 1.5 Pro',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video'],
          inputs: {
            referenceImages: { maxItems: 1 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-1-0-pro-250528',
          label: 'Seedance 1.0 Pro',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video'],
          inputs: {
            referenceImages: { maxItems: 1 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'doubao-seedance-1-0-pro-fast-251015',
          label: 'Seedance 1.0 Pro Fast',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video'],
          inputs: {
            referenceImages: { maxItems: 1 },
            initialFrame: true,
            lastFrame: true
          }
        }
      ] as const,
      defaultModel: 'doubao-seedance-2-0-260128',
      resolutions: ['720p', '480p', '1080p'],
      aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
      durationSeconds: { min: 2, max: 30, default: 5 },
      supportsAudio: true
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
