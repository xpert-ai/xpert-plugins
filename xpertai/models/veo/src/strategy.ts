import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  type IToolsetStrategy,
  ToolsetStrategy,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { buildVeoTools } from './tools.js'
import {
  VeoSvgIcon,
  VeoToolsetName,
  type RuntimeCapabilityRegistryLike,
  type VeoCredentials
} from './types.js'
import { VeoToolset, type VeoToolsetDescriptor } from './toolset.js'

const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'

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
        'Generate videos with Google Veo 3.1 through the Gemini Developer API.',
      zh_Hans: '通过 Gemini Developer API 使用 Google Veo 3.1 生成视频。'
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
          id: 'veo-3.1-generate-preview',
          label: 'Veo 3.1',
          modes: [
            'text_to_video',
            'image_to_video',
            'first_last_frame_to_video',
            'reference_to_video'
          ] as const,
          inputs: {
            referenceImages: { maxItems: 3 },
            initialFrame: true,
            lastFrame: true
          }
        },
        {
          id: 'veo-3.1-fast-generate-preview',
          label: 'Veo 3.1 Fast',
          modes: [
            'text_to_video',
            'image_to_video',
            'first_last_frame_to_video',
            'reference_to_video'
          ] as const,
          inputs: {
            referenceImages: { maxItems: 3 },
            initialFrame: true,
            lastFrame: true
          }
        }
      ],
      defaultModel: 'veo-3.1-generate-preview',
      resolutions: ['720p', '1080p', '4k'] as const,
      aspectRatios: ['16:9', '9:16'] as const,
      durationSeconds: { min: 4, max: 8, default: 8 },
      supportsAudio: true
    },
    configSchema: {
      type: 'object',
      properties: {
        gemini_api_key: {
          type: 'string',
          minLength: 1,
          title: 'Gemini API key',
          secret: true,
          'x-ui': {
            title: {
              en_US: 'Gemini API key',
              zh_Hans: 'Gemini API 密钥'
            },
            description: {
              en_US: 'API key created for the Gemini Developer API.',
              zh_Hans: '为 Gemini Developer API 创建的 API 密钥。'
            }
          }
        }
      },
      required: ['gemini_api_key'],
      additionalProperties: false
    }
  }

  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly runtimeCapabilities?: RuntimeCapabilityRegistryLike
  ) {}

  async validateConfig(config: unknown): Promise<void> {
    const credentials = readCredentials(config)
    if (!credentials.gemini_api_key?.trim()) {
      throw new Error('Gemini API key is missing')
    }
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
      credentials: {},
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

function readCredentials(config: unknown): VeoCredentials {
  if (!isRecord(config)) return {}
  if (isRecord(config.credentials)) {
    return {
      gemini_api_key: readOptionalString(config.credentials.gemini_api_key)
    }
  }
  return {
    gemini_api_key: readOptionalString(config.gemini_api_key)
  }
}

function asToolsetDescriptor(config: unknown): VeoToolsetDescriptor {
  return isRecord(config)
    ? (config as unknown as VeoToolsetDescriptor)
    : undefined
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
