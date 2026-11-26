import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  type IToolsetStrategy,
  ToolsetStrategy,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { buildVeoTools } from './tools.js'
import {
  VeoSvgIcon,
  VeoToolsetName
} from './types.js'
import { VeoToolset, type VeoToolsetDescriptor } from './toolset.js'

@Injectable()
@ToolsetStrategy(VeoToolsetName)
export class VeoStrategy implements IToolsetStrategy<unknown> {
  readonly meta = {
    author: 'Xpert AI',
    tags: ['video', 'aigc', 'veo', 'google', 'gemini'],
    name: VeoToolsetName,
    label: {
      en_US: 'Google Veo',
      zh_Hans: 'Google Veo 视频生成'
    },
    description: {
      en_US:
        'Generate videos with Gemini Omni 1.2 Flash through the Gemini Developer API.',
      zh_Hans: '通过 Gemini Developer API 使用 Gemini Omni 1.2 Flash 生成视频。'
    },
    icon: {
      type: 'svg' as const,
      value: VeoSvgIcon,
      color: '#4285F4'
    },
    videoGeneration: {
      protocolVersion: 2 as const,
      family: 'veo' as const,
      displayName: 'Google Veo',
      modes: [
        'text_to_video',
        'image_to_video',
        'first_last_frame_to_video',
        'reference_to_video'
      ] as const,
      tools: {
        textToVideo: 'veo_text_to_video',
        imageToVideo: 'veo_image_to_video',
        firstLastFrameToVideo: 'veo_first_last_frame_to_video',
        referenceToVideo: 'veo_reference_to_video',
        query: 'veo_video_query'
      },
      models: [
        {
          id: 'gemini-omni-1.2-flash',
          label: 'Gemini Omni 1.2 Flash',
          modes: [
            'text_to_video',
            'image_to_video',
            'first_last_frame_to_video',
            'reference_to_video'
          ] as const,
          inputs: {
            referenceImages: { maxItems: 6 },
            initialFrame: true,
            lastFrame: true
          }
        }
      ],
      defaultModel: 'gemini-omni-1.2-flash',
      resolutions: ['360p', '720p', '1080p', '4k'] as const,
      aspectRatios: ['16:9', '9:16'] as const,
      durationSeconds: { min: 3, max: 15, default: 8 },
      supportsAudio: true
    },
    configSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false
    }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistry
  ) {}

  async validateConfig(config: unknown): Promise<void> {
    void config
  }

  async create(
    config: unknown,
    params?: TBuiltinToolsetParams
  ): Promise<BuiltinToolset> {
    return new VeoToolset(
      asToolsetDescriptor(config),
      this.runtimeCapabilities,
      params
    )
  }

  createTools(): ReturnType<IToolsetStrategy['createTools']> {
    const tools = buildVeoTools({
      workspaceFiles: {
        uploadBuffer: async () => {
          throw new Error(
            'Xpert workspace file runtime capability is required for Veo outputs.'
          )
        },
        readBuffer: async () => {
          throw new Error(
            'Xpert workspace file runtime capability is required for Veo inputs.'
          )
        },
        deleteFile: async () => undefined
      }
    })
    // Current plugin-sdk releases still type built-in tool schemas as Zod-only.
    return tools as unknown as ReturnType<IToolsetStrategy['createTools']>
  }
}

function asToolsetDescriptor(config: unknown): VeoToolsetDescriptor {
  return isRecord(config)
    ? (config as unknown as VeoToolsetDescriptor)
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
