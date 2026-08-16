import { Inject, Injectable, Optional } from '@nestjs/common'
import {
  BuiltinToolset,
  type IToolsetStrategy,
  ToolsetStrategy,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type TBuiltinToolsetParams
} from '@xpert-ai/plugin-sdk'
import { buildKlingTools } from './tools.js'
import { KlingVideo } from './types.js'
import { KlingVideoToolset, type KlingVideoToolsetDescriptor } from './toolset.js'

const SvgIcon =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="#111827"/><path d="M7 5h3v5l4-5h4l-5 6 5 8h-4l-4-7v7H7V5z" fill="white"/></svg>'

@Injectable()
@ToolsetStrategy(KlingVideo)
export class KlingVideoStrategy implements IToolsetStrategy<unknown> {
  meta = {
    author: 'Xpert AI',
    tags: ['video', 'aigc', 'kling'],
    name: KlingVideo,
    label: { en_US: 'Kling Video', zh_Hans: '可灵视频' },
    description: {
      en_US: 'Generate videos through the official Kling AI Open Platform.',
      zh_Hans: '通过可灵 AI 开放平台生成视频。'
    },
    icon: { type: 'svg' as const, value: SvgIcon, color: '#111827' },
    videoGeneration: {
      protocolVersion: 2 as const,
      family: 'kling' as const,
      displayName: 'Kling AI',
      modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'] as const,
      tools: {
        textToVideo: 'kling_text_to_video',
        imageToVideo: 'kling_image_to_video',
        firstLastFrameToVideo: 'kling_first_last_frame_to_video',
        referenceToVideo: 'kling_reference_to_video',
        query: 'kling_video_query'
      },
      models: [
        {
          id: 'kling-v3',
          label: 'Kling 3.0',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video'],
          inputs: { referenceImages: { maxItems: 1 }, initialFrame: true, lastFrame: true }
        },
        {
          id: 'kling-v3-omni',
          label: 'Kling 3.0 Omni',
          modes: ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
          inputs: { referenceImages: { maxItems: 7 }, initialFrame: true, lastFrame: true }
        },
        {
          id: 'kling-3.0-turbo',
          label: 'Kling 3.0 Turbo',
          modes: ['text_to_video', 'image_to_video'],
          inputs: { referenceImages: { maxItems: 1 }, initialFrame: true }
        }
      ] as const,
      defaultModel: 'kling-v3',
      resolutions: ['720p', '1080p'],
      aspectRatios: ['16:9', '9:16', '1:1'],
      durationSeconds: { min: 3, max: 15, default: 5 },
      supportsAudio: true
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

  async validateConfig(config: unknown): Promise<void> {
    void config
  }

  async create(config: unknown, params?: TBuiltinToolsetParams): Promise<BuiltinToolset> {
    return new KlingVideoToolset(asToolsetDescriptor(config), this.runtimeCapabilities, params)
  }

  createTools(): ReturnType<IToolsetStrategy['createTools']> {
    const tools = buildKlingTools({
      workspaceFiles: {
        uploadBuffer: async () => {
          throw new Error('Xpert Workspace Files capability is required for Kling video generation.')
        },
        readBuffer: async () => {
          throw new Error('Xpert Workspace Files capability is required for Kling video generation.')
        },
        deleteFile: async () => {
          throw new Error('Xpert Workspace Files capability is required for Kling video generation.')
        }
      }
    })
    // Current plugin-sdk releases still type built-in tool schemas as Zod-only.
    return tools as unknown as ReturnType<IToolsetStrategy['createTools']>
  }
}

function asToolsetDescriptor(config: unknown): KlingVideoToolsetDescriptor {
  return isRecord(config) ? (config as unknown as KlingVideoToolsetDescriptor) : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
