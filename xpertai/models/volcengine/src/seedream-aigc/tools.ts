import { randomUUID } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import {
  AiModelTypeEnum,
  getToolCallIdFromConfig,
  type ImageGenerationOperation,
  type VideoGenerationOperation
} from '@xpert-ai/contracts'
import type { AIGCModelObservation } from '@xpert-ai/plugin-sdk'
import { SeedreamArkClient } from './client.js'
import { inputToBuffer, bufferToDataUrl, enforceMaxBytes, createGeneratedFileName } from './assets.js'
import { VOLCENGINE_PLUGIN_NAME, VOLCENGINE_VIDEO_JOB, VOLCENGINE_VIDEO_QUEUE } from './constants.js'
import {
  normalizeBoolean,
  normalizeString,
  normalizeVideoGenerationOptions,
  getVideoModelCapabilities,
  isSeedance2Model,
  type VideoGenerationInput
} from './rules.js'
import { uploadGeneratedAsset } from './workspace-upload.js'
import { SeedreamAigc } from './types.js'
import { normalizeSeedreamImageObservation } from './usage.js'
import type {
  SeedanceVideoJobPayload,
  SeedreamArtifactFile,
  SeedreamToolDependencies,
  SeedreamToolResult
} from './types.js'

const IMAGE_FOLDER = 'files/seedream-aigc/images'
const VIDEO_FOLDER = 'files/seedream-aigc/videos'
const IMAGE_LIMIT_BYTES = 30 * 1024 * 1024
const MULTIMODAL_IMAGE_LIMIT_BYTES = 30 * 1024 * 1024
const AUDIO_LIMIT_BYTES = 15 * 1024 * 1024
const VIDEO_QUERY_MAX_WAIT_SECONDS = 45
const VIDEO_QUERY_POLL_MS = 1_000
const MULTIMODAL_MODE_RULES: Record<
  string,
  { label: string; needImage: boolean; needVideo: boolean; needAudio: boolean; audioOnly?: boolean }
> = {
  text_image: {
    label: 'text(optional)+image',
    needImage: true,
    needVideo: false,
    needAudio: false
  },
  text_video: {
    label: 'text(optional)+video',
    needImage: false,
    needVideo: true,
    needAudio: false
  },
  text_image_audio: {
    label: 'text(optional)+image+audio',
    needImage: true,
    needVideo: false,
    needAudio: true
  },
  text_image_video: {
    label: 'text(optional)+image+video',
    needImage: true,
    needVideo: true,
    needAudio: false
  },
  text_video_audio: {
    label: 'text(optional)+video+audio',
    needImage: false,
    needVideo: true,
    needAudio: true
  },
  text_image_video_audio: {
    label: 'text(optional)+image+video+audio',
    needImage: true,
    needVideo: true,
    needAudio: true
  },
  text_audio: {
    label: 'text(optional)+audio (Seedance 2.5 only)',
    needImage: false,
    needVideo: false,
    needAudio: true,
    audioOnly: true
  }
}

const SEEDREAM_IMAGE_CAPABILITIES: Record<
  string,
  { supportsSequential: boolean; supportsStream: boolean; supportsOutputFormat: boolean; maxInputImages: number }
> = {
  'doubao-seedream-5-0-pro-260628': {
    supportsSequential: false,
    supportsStream: false,
    supportsOutputFormat: true,
    maxInputImages: 10
  },
  'doubao-seedream-5-0-260128': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: true,
    maxInputImages: 14
  },
  'doubao-seedream-4-5-251128': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: false,
    maxInputImages: 14
  },
  'doubao-seedream-4-0-250828': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: false,
    maxInputImages: 14
  }
}

export function buildSeedreamTools(deps: SeedreamToolDependencies) {
  return [
    buildTextToImageTool(deps),
    buildImageToImageTool(deps),
    buildMultiImagesToImageTool(deps),
    buildMultiImagesToMultiImagesTool(deps),
    buildTextToVideoTool(deps),
    buildImageToVideoTool(deps),
    buildFirstLastFrameToVideoTool(deps),
    buildMultimodalReferenceToVideoTool(deps),
    buildVideoQueryTool(deps)
  ]
}

function buildTextToImageTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any, config): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const client = createClient(deps)
      const model = normalizeString(input.model) ?? 'doubao-seedream-4-5-251128'
      const outputFormat = getImageOutputFormat(model, input.output_format)
      const generation = await generateImages(
        deps,
        client,
        createImagePayload(
          model,
          input,
          {
            model,
            prompt,
            size: normalizeString(input.size) ?? '2048x2048',
            response_format: 'url',
            watermark: normalizeBoolean(input.watermark, true)
          },
          { sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled' }
        ),
        model,
        getToolCallIdFromConfig(config),
        'seedream_text_to_image',
        'text_to_image'
      )
      const response = generation.response
      const files = await finalizeImageGeneration(() =>
        uploadImageOutputs(response, client, deps, 'seedream-text-to-image', 'url', outputFormat)
      )
      return result(`Generated ${files.length} image(s).`, files, { usage: response?.usage })
    },
    {
      name: 'seedream_text_to_image',
      description: 'Generate images from text descriptions using Volcengine Doubao Seedream models.',
      schema: textToImageSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildImageToImageTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any, config): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const image = await encodeImageInput(input.input_image_file, deps, IMAGE_LIMIT_BYTES, 'input image')
      const client = createClient(deps)
      const model = normalizeString(input.model) ?? 'doubao-seedream-4-5-251128'
      const outputFormat = getImageOutputFormat(model, input.output_format)
      const generation = await generateImages(
        deps,
        client,
        createImagePayload(
          model,
          input,
          {
            model,
            prompt,
            image,
            size: normalizeString(input.size) ?? '2048x2048',
            response_format: 'b64_json',
            watermark: normalizeBoolean(input.watermark, true)
          },
          { sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled' }
        ),
        model,
        getToolCallIdFromConfig(config),
        'seedream_image_to_image',
        'image_to_image'
      )
      const response = generation.response
      const files = await finalizeImageGeneration(() => uploadImageOutputs(
        response,
        client,
        deps,
        'seedream-image-to-image',
        'b64_json',
        outputFormat
      ))
      return result(`Generated ${files.length} image(s).`, files, { usage: response?.usage })
    },
    {
      name: 'seedream_image_to_image',
      description: 'Generate images from text and one reference image using Volcengine Doubao Seedream models.',
      schema: imageToImageSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildMultiImagesToImageTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any, config): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const model = normalizeString(input.model) ?? 'doubao-seedream-4-5-251128'
      const imageCapabilities = getSeedreamImageCapabilities(model)
      const images = await encodeImageInputs(
        input.input_image_files,
        deps,
        IMAGE_LIMIT_BYTES,
        2,
        imageCapabilities.maxInputImages
      )
      const client = createClient(deps)
      const outputFormat = getImageOutputFormat(model, input.output_format)
      const generation = await generateImages(
        deps,
        client,
        createImagePayload(
          model,
          input,
          {
            model,
            prompt,
            image: images,
            size: normalizeString(input.size) ?? '2048x2048',
            response_format: 'b64_json',
            watermark: normalizeBoolean(input.watermark, true)
          },
          { sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled' }
        ),
        model,
        getToolCallIdFromConfig(config),
        'seedream_multi_images_to_image',
        'multi_image_to_image'
      )
      const response = generation.response
      const files = await finalizeImageGeneration(() => uploadImageOutputs(
        response,
        client,
        deps,
        'seedream-multi-images-to-image',
        'b64_json',
        outputFormat
      ))
      return result(`Generated ${files.length} image(s).`, files, { usage: response?.usage })
    },
    {
      name: 'seedream_multi_images_to_image',
      description: 'Generate an image from text and multiple reference images using Volcengine Doubao Seedream models.',
      schema: multiImagesToImageSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildMultiImagesToMultiImagesTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any, config): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const model = normalizeString(input.model) ?? 'doubao-seedream-4-5-251128'
      const imageCapabilities = getSeedreamImageCapabilities(model)
      if (!imageCapabilities.supportsSequential) {
        throw new Error(`${model} does not support sequential image generation`)
      }
      const images = await encodeImageInputs(
        input.input_image_files,
        deps,
        IMAGE_LIMIT_BYTES,
        2,
        imageCapabilities.maxInputImages
      )
      const maxImages = clampNumber(input.max_images, 3, 1, 15)
      const client = createClient(deps)
      const outputFormat = getImageOutputFormat(model, input.output_format)
      const generation = await generateImages(
        deps,
        client,
        createImagePayload(
          model,
          input,
          {
            model,
            prompt,
            image: images,
            size: normalizeString(input.size) ?? '2048x2048',
            response_format: 'b64_json',
            watermark: normalizeBoolean(input.watermark, true)
          },
          {
            sequential_image_generation: 'auto',
            sequential_image_generation_options: { max_images: maxImages }
          }
        ),
        model,
        getToolCallIdFromConfig(config),
        'seedream_multi_images_to_multi_images',
        'multi_image_to_image'
      )
      const response = generation.response
      const files = await finalizeImageGeneration(() => uploadImageOutputs(
        response,
        client,
        deps,
        'seedream-multi-images-to-multi-images',
        'b64_json',
        outputFormat
      ))
      return result(`Generated ${files.length} image(s).`, files, { usage: response?.usage })
    },
    {
      name: 'seedream_multi_images_to_multi_images',
      description:
        'Generate a group of images from text and multiple reference images using Volcengine Doubao Seedream models.',
      schema: multiImagesToMultiImagesSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildTextToVideoTool(deps: SeedreamToolDependencies) {
  return tool(
    async (rawInput: unknown, config): Promise<SeedreamToolResult> => {
      const input = requireRecord(rawInput)
      const options = normalizeVideoGenerationOptions(parseVideoGenerationInput(input))
      if (!options.prompt) throw new Error('Prompt is required')
      return submitVideoTask(
        deps,
        config,
        'seedance_text_to_video',
        'text_to_video',
        options,
        createVideoPayload(options, [{ type: 'text', text: options.prompt }]),
        'Text-to-video task submitted.'
      )
    },
    {
      name: 'seedance_text_to_video',
      description: 'Submit a Seedance text-to-video generation task and return the task id.',
      schema: textToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildImageToVideoTool(deps: SeedreamToolDependencies) {
  return tool(
    async (rawInput: unknown, config): Promise<SeedreamToolResult> => {
      const input = requireRecord(rawInput)
      const options = normalizeVideoGenerationOptions(parseVideoGenerationInput(input))
      if (!options.prompt) throw new Error('Prompt is required')
      const image = await encodeImageInput(input.input_image_file, deps, IMAGE_LIMIT_BYTES, 'input image')
      return submitVideoTask(
        deps,
        config,
        'seedance_image_to_video',
        'image_to_video',
        options,
        createVideoPayload(options, [
          { type: 'text', text: options.prompt },
          { type: 'image_url', image_url: { url: image } }
        ]),
        'Image-to-video task submitted.'
      )
    },
    {
      name: 'seedance_image_to_video',
      description: 'Submit a Seedance image-to-video generation task and return the task id.',
      schema: imageToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildFirstLastFrameToVideoTool(deps: SeedreamToolDependencies) {
  return tool(
    async (rawInput: unknown, config): Promise<SeedreamToolResult> => {
      const input = requireRecord(rawInput)
      const options = normalizeVideoGenerationOptions(parseVideoGenerationInput(input))
      if (!options.prompt) throw new Error('Prompt is required')
      const firstFrame = await encodeImageInput(input.first_frame_file, deps, IMAGE_LIMIT_BYTES, 'first frame')
      const lastFrame = await encodeImageInput(input.last_frame_file, deps, IMAGE_LIMIT_BYTES, 'last frame')
      return submitVideoTask(
        deps,
        config,
        'seedance_first_last_frame_to_video',
        'first_last_frame_to_video',
        options,
        createVideoPayload(options, [
          { type: 'text', text: options.prompt },
          { type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' },
          { type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' }
        ]),
        'First-last-frame video task submitted.'
      )
    },
    {
      name: 'seedance_first_last_frame_to_video',
      description: 'Submit a Seedance video task from first and last frame images and return the task id.',
      schema: firstLastFrameToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildMultimodalReferenceToVideoTool(deps: SeedreamToolDependencies) {
  return tool(
    async (rawInput: unknown, config): Promise<SeedreamToolResult> => {
      const input = requireRecord(rawInput)
      const options = normalizeVideoGenerationOptions({
        ...parseVideoGenerationInput(input),
        model: normalizeString(input.model) ?? 'doubao-seedance-2-0-260128',
        ratio: normalizeString(input.ratio) ?? 'adaptive'
      })
      if (!isSeedance2Model(options.model)) {
        throw new Error('Multimodal reference video only supports Seedance 2.5/2.0 models')
      }
      const imageInputs = toArray(input.reference_image_files)
      const videoUrls = parseUrlList(input.reference_video_urls)
      const audioInputs = toArray(input.reference_audio_files)
      const audioUrls = parsePublicHttpsUrlList(input.reference_audio_urls, 'reference audio URL')
      const mode =
        normalizeString(input.input_mode) ??
        inferMultimodalInputMode(imageInputs.length, videoUrls.length, audioInputs.length + audioUrls.length)
      const modeRule = MULTIMODAL_MODE_RULES[mode]
      if (!modeRule) {
        throw new Error('Invalid multimodal input mode')
      }
      validateMultimodalInputs(options.model, modeRule, imageInputs, videoUrls, audioInputs.length + audioUrls.length)
      const content: Record<string, unknown>[] = []
      if (options.prompt) {
        content.push({ type: 'text', text: options.prompt })
      }
      for (const image of imageInputs) {
        content.push({
          type: 'image_url',
          image_url: { url: await encodeImageInput(image, deps, MULTIMODAL_IMAGE_LIMIT_BYTES, 'reference image') },
          role: 'reference_image'
        })
      }
      for (const videoUrl of videoUrls) {
        content.push({ type: 'video_url', video_url: { url: videoUrl }, role: 'reference_video' })
      }
      for (const audio of audioInputs) {
        const dataUrl = await encodeAudioInput(audio, deps)
        content.push({ type: 'audio_url', audio_url: { url: dataUrl }, role: 'reference_audio' })
      }
      for (const audioUrl of audioUrls) {
        content.push({ type: 'audio_url', audio_url: { url: audioUrl }, role: 'reference_audio' })
      }
      return submitVideoTask(
        deps,
        config,
        'seedance_multimodal_reference_to_video',
        'reference_to_video',
        options,
        createVideoPayload(options, content),
        'Multimodal reference video task submitted.',
        videoUrls.length > 0
      )
    },
    {
      name: 'seedance_multimodal_reference_to_video',
      description: 'Submit a Seedance 2.5/2.0 multimodal reference video task and return the task id.',
      schema: multimodalReferenceToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildVideoQueryTool(deps: SeedreamToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<SeedreamToolResult> => {
      const input = requireRecord(rawInput)
      const taskId = requireString(input.task_id, 'Task id is required')
      const waitSeconds = clampNumber(input.wait_seconds, VIDEO_QUERY_MAX_WAIT_SECONDS, 0, VIDEO_QUERY_MAX_WAIT_SECONDS)
      const managedQueue = requireManagedQueue(deps.managedQueue)
      let snapshot = await managedQueue.getJob<SeedanceVideoJobPayload>({ jobId: taskId })
      const deadline = Date.now() + waitSeconds * 1_000
      while (snapshot && !isTerminalQueueState(snapshot.state) && Date.now() < deadline) {
        await (deps.sleep ?? delay)(Math.min(VIDEO_QUERY_POLL_MS, Math.max(0, deadline - Date.now())))
        snapshot = await managedQueue.getJob<SeedanceVideoJobPayload>({ jobId: taskId })
      }

      if (!snapshot) throw new Error(`Seedance video generation task ${taskId} was not found`)
      if (snapshot.state === 'completed' && snapshot.data.result) return snapshot.data.result
      if (snapshot.state === 'failed') {
        throw new Error(snapshot.failedReason || snapshot.data.errorCode || `Seedance video task ${taskId} failed`)
      }
      return seedreamResult(
        `Video task ${taskId} status: ${snapshot.data.providerState || snapshot.data.phase}. Query the same task ID later.`,
        [],
        {
          task_id: taskId,
          request_id: snapshot.data.requestId,
          provider_request_id: snapshot.data.providerRequestId,
          status: snapshot.data.providerState || snapshot.data.phase,
          model: snapshot.data.model
        }
      )
    },
    {
      name: 'seedance_video_query',
      description:
        'Query a Seedance video generation task and upload the completed video to the workspace when available.',
      schema: videoQuerySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

const IMAGE_SIZE_OPTIONS = [
  ['2048x2048', '1:1 (2048x2048)'],
  ['2304x1728', '4:3 (2304x1728)'],
  ['1728x2304', '3:4 (1728x2304)'],
  ['2848x1600', '16:9 (2848x1600)'],
  ['1600x2848', '9:16 (1600x2848)'],
  ['2496x1664', '3:2 (2496x1664)'],
  ['1664x2496', '2:3 (1664x2496)'],
  ['3136x1344', '21:9 (3136x1344)'],
  ['4096x4096', '1:1 (4096x4096)'],
  ['4704x3520', '4:3 (4704x3520)'],
  ['3520x4704', '3:4 (3520x4704)'],
  ['5504x3040', '16:9 (5504x3040)'],
  ['3040x5504', '9:16 (3040x5504)'],
  ['4992x3328', '3:2 (4992x3328)'],
  ['3328x4992', '2:3 (3328x4992)'],
  ['6240x2656', '21:9 (6240x2656)'],
  ['3072x3072', '5.0 Lite 3K · 1:1 (3072x3072)'],
  ['3456x2592', '5.0 Lite 3K · 4:3 (3456x2592)'],
  ['2592x3456', '5.0 Lite 3K · 3:4 (2592x3456)'],
  ['4096x2304', '5.0 Lite 3K · 16:9 (4096x2304)'],
  ['2304x4096', '5.0 Lite 3K · 9:16 (2304x4096)'],
  ['3744x2496', '5.0 Lite 3K · 3:2 (3744x2496)'],
  ['2496x3744', '5.0 Lite 3K · 2:3 (2496x3744)'],
  ['4704x2016', '5.0 Lite 3K · 21:9 (4704x2016)'],
  ['2368x1776', '5.0 Pro 2K · 4:3 (2368x1776)'],
  ['1776x2368', '5.0 Pro 2K · 3:4 (1776x2368)'],
  ['2816x1584', '5.0 Pro 2K · 16:9 (2816x1584)'],
  ['1584x2816', '5.0 Pro 2K · 9:16 (1584x2816)'],
  ['1024x1024', '5.0 Pro/4.0 1K · 1:1 (1024x1024)'],
  ['1152x864', '5.0 Pro/4.0 1K · 4:3 (1152x864)'],
  ['864x1152', '5.0 Pro/4.0 1K · 3:4 (864x1152)'],
  ['1424x800', '5.0 Pro 1K · 16:9 (1424x800)'],
  ['800x1424', '5.0 Pro 1K · 9:16 (800x1424)'],
  ['1568x672', '5.0 Pro 1K · 21:9 (1568x672)'],
  ['1280x720', '4.0 1K · 16:9 (1280x720)'],
  ['720x1280', '4.0 1K · 9:16 (720x1280)'],
  ['1512x648', '4.0 1K · 21:9 (1512x648)']
] as const

const SEEDREAM_MODEL_OPTIONS = [
  ['doubao-seedream-4-0-250828', 'Seedream4.0'],
  ['doubao-seedream-4-5-251128', 'Seedream4.5'],
  ['doubao-seedream-5-0-260128', 'Seedream5.0 Lite'],
  ['doubao-seedream-5-0-pro-260628', 'Seedream5.0 Pro']
] as const

const SEQUENTIAL_SEEDREAM_MODEL_OPTIONS = SEEDREAM_MODEL_OPTIONS.filter(
  ([value]) => value !== 'doubao-seedream-5-0-pro-260628'
)

const SEEDANCE_MODEL_OPTIONS = [
  ['doubao-seedance-2-5-260628', 'Seedance2.5'],
  ['doubao-seedance-2-0-260128', 'Seedance2.0'],
  ['doubao-seedance-2-0-fast-260128', 'Seedance2.0 Fast'],
  ['doubao-seedance-2-0-mini-260615', 'Seedance2.0 Mini'],
  ['doubao-seedance-1-5-pro-251215', 'Seedance1.5 Pro'],
  ['doubao-seedance-1-0-pro-250528', 'Seedance1.0 Pro'],
  ['doubao-seedance-1-0-pro-fast-251015', 'Seedance1.0 Pro Fast']
] as const

const SEEDANCE_2_MODEL_OPTIONS = [
  ['doubao-seedance-2-5-260628', 'Seedance2.5'],
  ['doubao-seedance-2-0-260128', 'Seedance2.0'],
  ['doubao-seedance-2-0-fast-260128', 'Seedance2.0 Fast'],
  ['doubao-seedance-2-0-mini-260615', 'Seedance2.0 Mini']
] as const

const VIDEO_RESOLUTION_OPTIONS = [
  ['480p', '480p'],
  ['720p', '720p'],
  ['1080p', '1080p']
] as const

const VIDEO_RATIO_OPTIONS = [
  ['16:9', '16:9'],
  ['9:16', '9:16'],
  ['1:1', '1:1'],
  ['4:3', '4:3'],
  ['3:4', '3:4'],
  ['adaptive', 'Adaptive']
] as const

const MULTIMODAL_INPUT_MODE_OPTIONS = [
  ['text_audio', 'text(optional)+audio (Seedance 2.5 only)'],
  ['text_image', 'text(optional)+image'],
  ['text_video', 'text(optional)+video'],
  ['text_image_audio', 'text(optional)+image+audio'],
  ['text_image_video', 'text(optional)+image+video'],
  ['text_video_audio', 'text(optional)+video+audio'],
  ['text_image_video_audio', 'text(optional)+image+video+audio']
] as const

const SERVICE_TIER_OPTIONS = [
  ['default', 'Default'],
  ['flex', 'Flex']
] as const

const BITRATE_MODE_OPTIONS = [
  ['standard', 'Standard'],
  ['high', 'High']
] as const

const VIDEO_OUTPUT_FORMAT_OPTIONS = [
  ['mp4', 'MP4'],
  ['mov', 'MOV']
] as const

const IMAGE_OUTPUT_FORMAT_OPTIONS = [
  ['jpeg', 'JPEG'],
  ['png', 'PNG']
] as const

function i18n(en_US: string, zh_Hans: string) {
  return { en_US, zh_Hans }
}

function enumLabels(options: readonly (readonly [string, string])[]) {
  return Object.fromEntries(options.map(([value, label]) => [value, label]))
}

const promptProperty = {
  type: 'string',
  title: 'Prompt',
  description: 'Text description for image generation.',
  'x-ui': {
    title: i18n('Prompt', '提示词'),
    description: i18n('Text description for image generation.', '您想要生成的图像文本描述')
  }
} as const

const singleReferenceImageProperty = {
  title: 'Reference image',
  description: 'Reference image file, URL, path, Buffer, or data URL.',
  'x-ui': {
    title: i18n('Reference image', '参考图片'),
    description: i18n(
      'Reference image file, URL, path, Buffer, or data URL.',
      '用于图像生成的参考图片文件、URL、路径、Buffer 或 data URL。'
    )
  }
} as const

const referenceImagesProperty = {
  anyOf: [
    {
      type: 'array',
      minItems: 2,
      maxItems: 14,
      items: {
        anyOf: [{ type: 'string' }, { type: 'object' }]
      }
    },
    { type: 'string' }
  ],
  title: 'Reference images',
  description: 'Reference image files, URLs, paths, Buffers, or data URLs. Pass as an array, not a JSON string.',
  'x-ui': {
    title: i18n('Reference images', '参考图片列表'),
    description: i18n(
      'Reference image files, URLs, paths, Buffers, or data URLs. Pass as an array, not a JSON string.',
      '用于图像生成的一组参考图片文件、URL、路径、Buffer 或 data URL。必须传数组，不要传 JSON 字符串。'
    )
  }
} as const

const sizeProperty = {
  type: 'string',
  title: 'Image size',
  description: 'Generated image size.',
  enum: IMAGE_SIZE_OPTIONS.map(([value]) => value),
  default: '2048x2048',
  'x-ui': {
    title: i18n('Image size', '图像尺寸'),
    description: i18n('Generated image size.', '生成图片的尺寸。'),
    enumLabels: enumLabels(IMAGE_SIZE_OPTIONS)
  }
} as const

const maxImagesProperty = {
  type: 'integer',
  title: 'Maximum generated images',
  description: 'Maximum number of generated images, 1-15.',
  minimum: 1,
  maximum: 15,
  default: 3,
  'x-ui': {
    title: i18n('Maximum generated images', '最大生成张数'),
    description: i18n('Maximum number of generated images, 1-15.', '最多生成的图片数量，范围 1-15。')
  }
} as const

const watermarkProperty = {
  type: 'string',
  title: 'Watermark',
  description: 'Whether to add watermark.',
  enum: ['true', 'false'],
  default: 'true',
  'x-ui': {
    title: i18n('Watermark', '水印'),
    description: i18n('Whether to add watermark.', '是否添加水印。'),
    enumLabels: {
      true: i18n('Enabled', '启用'),
      false: i18n('Disabled', '禁用')
    }
  }
} as const

const modelProperty = {
  type: 'string',
  title: 'Model version',
  description: 'Seedream model version.',
  enum: SEEDREAM_MODEL_OPTIONS.map(([value]) => value),
  default: 'doubao-seedream-4-5-251128',
  'x-ui': {
    title: i18n('Model version', '模型版本'),
    description: i18n('Seedream model version.', '使用的 Seedream 模型版本。'),
    enumLabels: enumLabels(SEEDREAM_MODEL_OPTIONS)
  }
} as const

const sequentialModelProperty = {
  ...modelProperty,
  enum: SEQUENTIAL_SEEDREAM_MODEL_OPTIONS.map(([value]) => value),
  'x-ui': {
    ...modelProperty['x-ui'],
    enumLabels: enumLabels(SEQUENTIAL_SEEDREAM_MODEL_OPTIONS)
  }
} as const

const imageOutputFormatProperty = {
  type: 'string',
  title: 'Output format',
  description: 'Output image format. Effective for Seedream 5.0 Pro/Lite.',
  enum: IMAGE_OUTPUT_FORMAT_OPTIONS.map(([value]) => value),
  default: 'jpeg',
  'x-ui': {
    title: i18n('Output format', '输出格式'),
    description: i18n(
      'Output image format. Effective for Seedream 5.0 Pro/Lite.',
      '输出图像格式，仅对 Seedream 5.0 Pro/Lite 生效。'
    ),
    enumLabels: enumLabels(IMAGE_OUTPUT_FORMAT_OPTIONS)
  }
} as const

const sequentialImageGenerationProperty = {
  type: 'string',
  title: 'Sequential image generation',
  description: 'Whether to let the model generate a related image sequence.',
  enum: ['disabled', 'auto'],
  default: 'disabled',
  'x-ui': {
    title: i18n('Sequential image generation', '组图生成'),
    description: i18n(
      'Whether to let the model generate a related image sequence.',
      '是否让模型生成内容连续的组图。Seedream 5.0 Pro 不支持此参数。'
    ),
    enumLabels: {
      disabled: i18n('Disabled', '禁用'),
      auto: i18n('Automatic', '自动')
    }
  }
} as const

function imageSchema(properties: Record<string, unknown>, required = ['prompt']) {
  return {
    type: 'object',
    properties,
    required
  } as const
}

const imageSettingsProperties = {
  size: sizeProperty,
  output_format: imageOutputFormatProperty,
  sequential_image_generation: sequentialImageGenerationProperty,
  watermark: watermarkProperty,
  model: modelProperty
}

const textToImageSchema = imageSchema({
  prompt: promptProperty,
  ...imageSettingsProperties
})

const imageToImageSchema = imageSchema(
  {
    prompt: promptProperty,
    input_image_file: singleReferenceImageProperty,
    ...imageSettingsProperties
  },
  ['prompt', 'input_image_file']
)

const multiImagesToImageSchema = imageSchema(
  {
    prompt: promptProperty,
    input_image_files: referenceImagesProperty,
    ...imageSettingsProperties
  },
  ['prompt', 'input_image_files']
)

const multiImagesToMultiImagesSchema = imageSchema(
  {
    prompt: promptProperty,
    input_image_files: referenceImagesProperty,
    size: sizeProperty,
    output_format: imageOutputFormatProperty,
    max_images: maxImagesProperty,
    watermark: watermarkProperty,
    model: sequentialModelProperty
  },
  ['prompt', 'input_image_files']
)

const videoPromptProperty = {
  type: 'string',
  title: 'Prompt',
  description: 'Prompt for video generation, max 500 chars.',
  'x-ui': {
    title: i18n('Prompt', '提示词'),
    description: i18n('Prompt for video generation, max 500 chars.', '视频生成提示词，最多 500 个字符。')
  }
} as const

const seedanceModelProperty = {
  type: 'string',
  title: 'Model version',
  description: 'Seedance model version.',
  enum: SEEDANCE_MODEL_OPTIONS.map(([value]) => value),
  default: 'doubao-seedance-1-5-pro-251215',
  'x-ui': {
    title: i18n('Model version', '模型版本'),
    description: i18n('Seedance model version.', '使用的 Seedance 模型版本。'),
    enumLabels: enumLabels(SEEDANCE_MODEL_OPTIONS)
  }
} as const

const seedance2ModelProperty = {
  ...seedanceModelProperty,
  enum: SEEDANCE_2_MODEL_OPTIONS.map(([value]) => value),
  default: 'doubao-seedance-2-0-260128',
  'x-ui': {
    ...seedanceModelProperty['x-ui'],
    enumLabels: enumLabels(SEEDANCE_2_MODEL_OPTIONS)
  }
} as const

const videoResolutionProperty = {
  type: 'string',
  title: 'Video resolution',
  description: 'Video resolution.',
  enum: VIDEO_RESOLUTION_OPTIONS.map(([value]) => value),
  default: '720p',
  'x-ui': {
    title: i18n('Video resolution', '视频分辨率'),
    description: i18n('Video resolution.', '生成视频的分辨率。'),
    enumLabels: enumLabels(VIDEO_RESOLUTION_OPTIONS)
  }
} as const

const videoRatioProperty = {
  type: 'string',
  title: 'Aspect ratio',
  description: 'Video aspect ratio.',
  enum: VIDEO_RATIO_OPTIONS.map(([value]) => value),
  default: '16:9',
  'x-ui': {
    title: i18n('Aspect ratio', '画面比例'),
    description: i18n('Video aspect ratio.', '生成视频的画面比例。'),
    enumLabels: enumLabels(VIDEO_RATIO_OPTIONS)
  }
} as const

const multimodalVideoRatioProperty = {
  ...videoRatioProperty,
  default: 'adaptive'
} as const

const videoDurationProperty = {
  type: ['integer', 'string'],
  title: 'Duration',
  description: 'Video duration in seconds.',
  minimum: 2,
  maximum: 30,
  default: 5,
  'x-ui': {
    title: i18n('Duration', '视频时长'),
    description: i18n('Video duration in seconds.', '生成视频的时长，单位为秒。')
  }
} as const

const videoSeedProperty = {
  type: ['integer', 'string'],
  title: 'Seed',
  description: 'Random seed. Use -1 for a random seed.',
  minimum: -1,
  maximum: 4294967295,
  'x-ui': {
    title: i18n('Seed', '随机种子'),
    description: i18n('Random seed. Use -1 for a random seed.', '随机种子。填写 -1 表示随机。')
  }
} as const

function booleanSelectProperty(
  title: string,
  titleZh: string,
  description: string,
  descriptionZh: string,
  defaultValue: 'true' | 'false'
) {
  return {
    type: 'string',
    title,
    description,
    enum: ['true', 'false'],
    default: defaultValue,
    'x-ui': {
      title: i18n(title, titleZh),
      description: i18n(description, descriptionZh),
      enumLabels: {
        true: i18n('Enabled', '启用'),
        false: i18n('Disabled', '禁用')
      }
    }
  } as const
}

const videoCommonProperties = {
  prompt: videoPromptProperty,
  model: seedanceModelProperty,
  resolution: videoResolutionProperty,
  ratio: videoRatioProperty,
  duration: videoDurationProperty,
  seed: videoSeedProperty,
  camera_fixed: booleanSelectProperty(
    'Fixed camera',
    '固定镜头',
    'Whether to fix camera position.',
    '是否固定镜头位置。',
    'false'
  ),
  watermark: booleanSelectProperty('Watermark', '水印', 'Whether to add watermark.', '是否添加水印。', 'true'),
  generate_audio: booleanSelectProperty(
    'Generate audio',
    '生成音频',
    'Whether to generate synchronized audio.',
    '是否生成同步音频。',
    'true'
  ),
  draft: booleanSelectProperty('Draft mode', '草稿模式', 'Whether to use draft mode.', '是否使用草稿模式。', 'false'),
  return_last_frame: booleanSelectProperty(
    'Return last frame',
    '返回尾帧',
    'Whether to return last frame.',
    '是否返回尾帧。',
    'false'
  ),
  service_tier: {
    type: 'string',
    title: 'Service tier',
    description: 'Service tier.',
    enum: SERVICE_TIER_OPTIONS.map(([value]) => value),
    default: 'default',
    'x-ui': {
      title: i18n('Service tier', '服务档位'),
      description: i18n('Service tier.', '视频生成服务档位。'),
      enumLabels: enumLabels(SERVICE_TIER_OPTIONS)
    }
  },
  bitrate_mode: {
    type: 'string',
    title: 'Bitrate mode',
    description: 'Video bitrate quality for Seedance 2.0 models.',
    enum: BITRATE_MODE_OPTIONS.map(([value]) => value),
    default: 'standard',
    'x-ui': {
      title: i18n('Bitrate mode', '比特率模式'),
      description: i18n('Video bitrate quality for Seedance 2.0 models.', '视频比特率画质，仅 Seedance 2.0 系列支持。'),
      enumLabels: enumLabels(BITRATE_MODE_OPTIONS)
    }
  },
  output_format: {
    type: 'string',
    title: 'Output format',
    description: 'Output video format for Seedance 2.5.',
    enum: VIDEO_OUTPUT_FORMAT_OPTIONS.map(([value]) => value),
    default: 'mp4',
    'x-ui': {
      title: i18n('Output format', '输出格式'),
      description: i18n('Output video format for Seedance 2.5.', '输出视频格式，仅 Seedance 2.5 支持。'),
      enumLabels: enumLabels(VIDEO_OUTPUT_FORMAT_OPTIONS)
    }
  },
  priority: {
    type: ['integer', 'string'],
    title: 'Priority',
    description: 'Execution priority from 0 to 9 for Seedance 2.5/2.0 models.',
    minimum: 0,
    maximum: 9,
    default: 0,
    'x-ui': {
      title: i18n('Priority', '执行优先级'),
      description: i18n(
        'Execution priority from 0 to 9 for Seedance 2.5/2.0 models.',
        'Seedance 2.5/2.0 系列执行优先级，范围 0-9。'
      )
    }
  },
  web_search: booleanSelectProperty(
    'Web search',
    '联网搜索',
    'Enable web search for Seedance 2.5/2.0 models.',
    '为 Seedance 2.5/2.0 系列启用联网搜索。',
    'false'
  )
} as const

const videoReferenceImageProperty = {
  title: 'Reference image',
  description: 'Reference image file, URL, path, Buffer, or data URL.',
  'x-ui': {
    title: i18n('Reference image', '参考图片'),
    description: i18n(
      'Reference image file, URL, path, Buffer, or data URL.',
      '用于视频生成的参考图片文件、URL、路径、Buffer 或 data URL。'
    )
  }
} as const

const firstFrameProperty = {
  title: 'First frame image',
  description: 'First frame image file, URL, path, Buffer, or data URL.',
  'x-ui': {
    title: i18n('First frame image', '首帧图片'),
    description: i18n(
      'First frame image file, URL, path, Buffer, or data URL.',
      '视频首帧图片文件、URL、路径、Buffer 或 data URL。'
    )
  }
} as const

const lastFrameProperty = {
  title: 'Last frame image',
  description: 'Last frame image file, URL, path, Buffer, or data URL.',
  'x-ui': {
    title: i18n('Last frame image', '尾帧图片'),
    description: i18n(
      'Last frame image file, URL, path, Buffer, or data URL.',
      '视频尾帧图片文件、URL、路径、Buffer 或 data URL。'
    )
  }
} as const

const multimodalInputModeProperty = {
  type: 'string',
  title: 'Input mode',
  description: 'Multimodal input combination.',
  enum: MULTIMODAL_INPUT_MODE_OPTIONS.map(([value]) => value),
  default: 'text_image',
  'x-ui': {
    title: i18n('Input mode', '输入模式'),
    description: i18n('Multimodal input combination.', '多模态参考素材组合方式。'),
    enumLabels: {
      text_image: i18n('text(optional)+image', '文本(可选)+图片'),
      text_audio: i18n('text(optional)+audio (Seedance 2.5 only)', '文本(可选)+音频（仅 Seedance 2.5）'),
      text_video: i18n('text(optional)+video', '文本(可选)+视频'),
      text_image_audio: i18n('text(optional)+image+audio', '文本(可选)+图片+音频'),
      text_image_video: i18n('text(optional)+image+video', '文本(可选)+图片+视频'),
      text_video_audio: i18n('text(optional)+video+audio', '文本(可选)+视频+音频'),
      text_image_video_audio: i18n('text(optional)+image+video+audio', '文本(可选)+图片+视频+音频')
    }
  }
} as const

const multimodalReferenceImagesProperty = {
  type: 'array',
  maxItems: 30,
  items: {},
  title: 'Reference images',
  description: 'Reference images.',
  'x-ui': {
    title: i18n('Reference images', '参考图片'),
    description: i18n('Reference images.', '视频生成参考图片；Seedance 2.5 最多 30 张，2.0 最多 9 张。')
  }
} as const

const multimodalReferenceVideoUrlsProperty = {
  type: 'string',
  title: 'Reference video URLs',
  description: 'Reference video URLs separated by comma or newline.',
  'x-ui': {
    title: i18n('Reference video URLs', '参考视频 URL'),
    description: i18n('Reference video URLs separated by comma or newline.', '参考视频 URL，可用英文逗号或换行分隔。')
  }
} as const

const multimodalReferenceAudioFilesProperty = {
  type: 'array',
  maxItems: 10,
  items: {},
  title: 'Reference audio files',
  description: 'Reference audio files.',
  'x-ui': {
    title: i18n('Reference audio files', '参考音频'),
    description: i18n('Reference audio files.', '视频生成参考音频；Seedance 2.5 最多 10 个，2.0 最多 3 个。')
  }
} as const

const multimodalReferenceAudioUrlsProperty = {
  type: 'string',
  maxLength: 6_100,
  title: 'Reference audio URLs',
  description: 'Public HTTPS reference audio URLs separated by comma or newline.',
  'x-ui': {
    title: i18n('Reference audio URLs', '参考音频 URL'),
    description: i18n(
      'Public HTTPS reference audio URLs separated by comma or newline.',
      '公网 HTTPS 参考音频 URL，可用英文逗号或换行分隔；Seedance 2.5 最多 10 个，2.0 最多 3 个。'
    )
  }
} as const

function videoObjectSchema(properties: Record<string, unknown>, required = ['prompt']) {
  return {
    type: 'object',
    properties,
    required
  } as const
}

const textToVideoSchema = videoObjectSchema(videoCommonProperties)

const imageToVideoSchema = videoObjectSchema(
  {
    ...videoCommonProperties,
    input_image_file: videoReferenceImageProperty
  },
  ['prompt', 'input_image_file']
)

const firstLastFrameToVideoSchema = videoObjectSchema(
  {
    ...videoCommonProperties,
    first_frame_file: firstFrameProperty,
    last_frame_file: lastFrameProperty
  },
  ['prompt', 'first_frame_file', 'last_frame_file']
)

const multimodalReferenceToVideoSchema = videoObjectSchema(
  {
    ...videoCommonProperties,
    model: seedance2ModelProperty,
    ratio: multimodalVideoRatioProperty,
    input_mode: multimodalInputModeProperty,
    reference_image_files: multimodalReferenceImagesProperty,
    reference_video_urls: multimodalReferenceVideoUrlsProperty,
    reference_audio_files: multimodalReferenceAudioFilesProperty,
    reference_audio_urls: multimodalReferenceAudioUrlsProperty
  },
  []
)

const videoTaskIdProperty = {
  type: 'string',
  title: 'Task ID',
  description: 'The video generation task id.',
  'x-ui': {
    title: i18n('Task ID', '任务 ID'),
    description: i18n('The video generation task id.', '视频生成任务 ID。')
  }
} as const

const videoQuerySchema = videoObjectSchema(
  {
    task_id: videoTaskIdProperty,
    model: videoCommonProperties.model,
    download_video: booleanSelectProperty(
      'Download video',
      '下载视频',
      'Whether to download and upload the video.',
      '是否下载并上传视频。',
      'true'
    ),
    wait_seconds: {
      type: 'integer',
      title: 'Bounded wait',
      description: 'Wait up to this many seconds for a task to produce video_url.',
      minimum: 0,
      maximum: VIDEO_QUERY_MAX_WAIT_SECONDS,
      default: VIDEO_QUERY_MAX_WAIT_SECONDS,
      'x-ui': {
        title: i18n('Bounded wait', '有界等待'),
        description: i18n(
          'Wait up to 45 seconds while the durable provider task continues.',
          '最多等待 45 秒；火山方舟的持久任务会继续运行。'
        )
      }
    }
  },
  ['task_id']
)

async function encodeImageInput(input: unknown, deps: SeedreamToolDependencies, limitBytes: number, label: string) {
  const fetchImpl = deps.fetch ?? fetch
  const { buffer, mimeType } = await inputToBuffer(input, {
    fetchImpl,
    workspaceFiles: deps.workspaceFiles,
    workspaceScope: deps.workspaceScope,
    defaultMimeType: 'image/png'
  })
  enforceMaxBytes(buffer, limitBytes, label)
  return bufferToDataUrl(buffer, mimeType)
}

async function encodeImageInputs(
  input: unknown,
  deps: SeedreamToolDependencies,
  limitBytes: number,
  minItems = 1,
  maxItems = Number.MAX_SAFE_INTEGER
) {
  const items = toArray(input)
  if (items.length < minItems) {
    throw new Error(`At least ${minItems} input images are required`)
  }
  if (items.length > maxItems) {
    throw new Error(`At most ${maxItems} input images are supported`)
  }
  return Promise.all(items.map((item, index) => encodeImageInput(item, deps, limitBytes, `input image ${index + 1}`)))
}

async function encodeAudioInput(input: unknown, deps: SeedreamToolDependencies) {
  const fetchImpl = deps.fetch ?? fetch
  const { buffer, mimeType } = await inputToBuffer(input, {
    fetchImpl,
    workspaceFiles: deps.workspaceFiles,
    workspaceScope: deps.workspaceScope,
    defaultMimeType: 'audio/mpeg'
  })
  enforceMaxBytes(buffer, AUDIO_LIMIT_BYTES, 'reference audio')
  return bufferToDataUrl(buffer, mimeType)
}

function getSeedreamImageCapabilities(model: string) {
  return SEEDREAM_IMAGE_CAPABILITIES[model] ?? SEEDREAM_IMAGE_CAPABILITIES['doubao-seedream-4-5-251128']
}

function getImageOutputFormat(model: string, value: unknown): 'jpeg' | 'png' {
  if (!getSeedreamImageCapabilities(model).supportsOutputFormat) {
    return 'jpeg'
  }
  return normalizeString(value) === 'png' ? 'png' : 'jpeg'
}

function createImagePayload(
  model: string,
  input: Record<string, unknown>,
  base: Record<string, unknown>,
  sequential?: Record<string, unknown>
) {
  const capabilities = getSeedreamImageCapabilities(model)
  const size = normalizeString(base.size)
  if (size) {
    validateImageSize(model, size)
  }
  const payload: Record<string, unknown> = { ...base }
  if (capabilities.supportsStream) {
    payload.stream = false
  }
  if (capabilities.supportsOutputFormat) {
    payload.output_format = getImageOutputFormat(model, input.output_format)
  }
  if (capabilities.supportsSequential && sequential) {
    Object.assign(payload, sequential)
  }
  return payload
}

function validateImageSize(model: string, size: string) {
  const allModels = new Set(SEEDREAM_MODEL_OPTIONS.map(([value]) => value))
  const modelGroups: Record<string, Set<string>> = {
    '4096x4096': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '4704x3520': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3520x4704': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '5504x3040': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3040x5504': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '4992x3328': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3328x4992': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '6240x2656': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3072x3072': new Set(['doubao-seedream-5-0-260128']),
    '3456x2592': new Set(['doubao-seedream-5-0-260128']),
    '2592x3456': new Set(['doubao-seedream-5-0-260128']),
    '4096x2304': new Set(['doubao-seedream-5-0-260128']),
    '2304x4096': new Set(['doubao-seedream-5-0-260128']),
    '3744x2496': new Set(['doubao-seedream-5-0-260128']),
    '2496x3744': new Set(['doubao-seedream-5-0-260128']),
    '4704x2016': new Set(['doubao-seedream-5-0-260128']),
    '2368x1776': new Set(['doubao-seedream-5-0-pro-260628']),
    '1776x2368': new Set(['doubao-seedream-5-0-pro-260628']),
    '2816x1584': new Set(['doubao-seedream-5-0-pro-260628']),
    '1584x2816': new Set(['doubao-seedream-5-0-pro-260628']),
    '1024x1024': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-4-0-250828']),
    '1152x864': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-4-0-250828']),
    '864x1152': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-4-0-250828']),
    '1424x800': new Set(['doubao-seedream-5-0-pro-260628']),
    '800x1424': new Set(['doubao-seedream-5-0-pro-260628']),
    '1568x672': new Set(['doubao-seedream-5-0-pro-260628']),
    '1280x720': new Set(['doubao-seedream-4-0-250828']),
    '720x1280': new Set(['doubao-seedream-4-0-250828']),
    '1512x648': new Set(['doubao-seedream-4-0-250828'])
  }
  const allowedModels = modelGroups[size] ?? allModels
  if (!allowedModels.has(model)) {
    throw new Error(`${size} is not supported by ${model}`)
  }
}

async function uploadImageOutputs(
  response: any,
  client: SeedreamArkClient,
  deps: SeedreamToolDependencies,
  filePrefix: string,
  expectedFormat: 'url' | 'b64_json',
  outputFormat: 'jpeg' | 'png' = 'jpeg'
) {
  const data = Array.isArray(response?.data) ? response.data : []
  if (!data.length) {
    throw new Error('Ark API did not return generated image data')
  }
  const files: SeedreamArtifactFile[] = []
  for (const [index, item] of data.entries()) {
    let buffer: Buffer
    let mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg'
    if (expectedFormat === 'url' && item?.url) {
      const downloaded = await client.downloadBuffer(item.url)
      buffer = downloaded.buffer
      mimeType = downloaded.mimeType || mimeType
    } else if (item?.b64_json) {
      buffer = Buffer.from(item.b64_json, 'base64')
    } else {
      throw new Error(`Generated image ${index + 1} is missing ${expectedFormat}`)
    }
    const fileName = createGeneratedFileName(filePrefix, index, mimeType)
    files.push(
      await uploadGeneratedAsset({
        workspaceFiles: deps.workspaceFiles,
        workspaceScope: deps.workspaceScope,
        buffer,
        mimeType,
        folder: IMAGE_FOLDER,
        fileName,
        metadata: {
          source: 'ark_image_generation',
          arkUrl: item?.url,
          arkSize: item?.size
        }
      })
    )
  }
  return files
}

function createVideoPayload(
  options: ReturnType<typeof normalizeVideoGenerationOptions>,
  content: Record<string, unknown>[]
) {
  const payload: Record<string, unknown> = {
    model: options.model,
    content,
    resolution: options.resolution,
    ratio: options.ratio,
    duration: options.duration,
    seed: options.seed,
    watermark: options.watermark,
    generate_audio: options.generate_audio,
    draft: options.draft,
    return_last_frame: options.return_last_frame
  }
  if (!options.isSeedance2) {
    if (options.capabilities.supportsCameraFixed) {
      payload.camera_fixed = options.camera_fixed
    }
    if (options.capabilities.supportsServiceTier) {
      payload.service_tier = options.service_tier
    }
  }
  if (options.capabilities.supportsBitrateMode) {
    payload.bitrate_mode = options.bitrate_mode
  }
  if (options.capabilities.supportsOutputFormat) {
    payload.output_format = options.output_format
  }
  if (options.capabilities.supportsPriority) {
    payload.priority = options.priority
  }
  if (options.capabilities.supportsWebSearch && options.web_search) {
    payload.tools = [{ type: 'web_search' }]
  }
  return payload
}

async function submitVideoTask(
  deps: SeedreamToolDependencies,
  config: unknown,
  toolName: string,
  operation: VideoGenerationOperation,
  options: ReturnType<typeof normalizeVideoGenerationOptions>,
  payload: Record<string, unknown>,
  message: string,
  videoInput = false
): Promise<SeedreamToolResult> {
  const invocationKey = getToolCallIdFromConfig(config) ?? randomUUID()
  const taskId = queueJobId(invocationKey)
  const runtimeScope = deps.runtimeScope ?? {}
  await requireManagedQueue(deps.managedQueue).enqueue({
    pluginName: VOLCENGINE_PLUGIN_NAME,
    queueName: VOLCENGINE_VIDEO_QUEUE,
    jobName: VOLCENGINE_VIDEO_JOB,
    jobId: taskId,
    scopeKey: deps.pluginScopeKey,
    tenantId: runtimeScope.tenantId,
    organizationId: runtimeScope.organizationId,
    userId: runtimeScope.userId,
    attempts: 3,
    backoffMs: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { age: 86_400, count: 1_000 },
    removeOnFail: { age: 604_800, count: 1_000 },
    payload: {
      requestId: invocationKey,
      model: options.model,
      toolName,
      modality: 'video',
      operation,
      pricingDimensions: {
      ...(options.duration > 0 ? { durationSeconds: options.duration } : {}),
      resolution: options.resolution,
      audio: options.generate_audio,
      videoInput,
      mode: operation
      },
      input: payload,
      phase: 'queued',
      startedAt: new Date().toISOString(),
      runtimeScope
    }
  })
  return videoSubmittedResult(taskId, options.model, message)
}

function videoSubmittedResult(taskId: string, model: string, message: string): SeedreamToolResult {
  const content = `${message}\nTask ID: ${taskId}\nCall seedance_video_query with this task_id to check completion and download the generated video.\nThe Managed Queue job submits and polls the provider task without occupying the conversation request.`
  return seedreamResult(content, [], {
    task_id: taskId,
    status: 'queued',
    model
  })
}

export function seedreamResult(
  message: string,
  files: SeedreamArtifactFile[],
  data?: Record<string, unknown>
): SeedreamToolResult {
  return [formatResultContent(message, files), { files, ...(data ? { data } : {}) }]
}

const result = seedreamResult

function formatResultContent(message: string, files: SeedreamArtifactFile[]) {
  if (!files.length) {
    return message
  }

  const fileLines = files
    .map((file, index) => {
      const url = file.fileUrl ?? file.url
      const metadataLines = [
        `workspacePath: ${file.workspacePath}`,
        `filePath: ${file.filePath}`,
        `mimeType: ${file.mimeType}`,
        ...(file.catalog ? [`catalog: ${file.catalog}`] : []),
        ...(file.scopeId ? [`scopeId: ${file.scopeId}`] : [])
      ]
      const title = url ? `${index + 1}. ${file.fileName}: ${url}` : `${index + 1}. ${file.fileName}`
      const preview = url && isImageFile(file) ? `\n![${file.fileName}](${url})` : ''
      return `${title}\n${metadataLines.join('\n')}${preview}`
    })
    .join('\n')

  return `${message}\n\nGenerated files:\n${fileLines}`
}

function isImageFile(file: SeedreamArtifactFile) {
  return file.mimeType?.startsWith('image/')
}

function createClient(deps: SeedreamToolDependencies) {
  return new SeedreamArkClient(deps.credentials, deps.fetch ?? fetch)
}

async function generateImages(
  deps: SeedreamToolDependencies,
  directClient: SeedreamArkClient,
  payload: Record<string, unknown>,
  model: string,
  toolCallId: string | undefined,
  toolName: string,
  operation: ImageGenerationOperation
) {
  if (deps.createImageModelClient) {
    if (!toolCallId) throw new Error('Tool call ID is required to record Seedream image usage')
    const pricingDimensions = {
      ...(normalizeString(payload.size) ? { resolution: normalizeString(payload.size) } : {}),
      ...(normalizeString(payload.sequential_image_generation)
        ? { mode: normalizeString(payload.sequential_image_generation) }
        : {})
    }
    const pricingSnapshot = deps.modelProvider?.resolvePricingSnapshot
      ? await deps.modelProvider.resolvePricingSnapshot({
          model,
          operation,
          modality: 'image',
          pricingDimensions,
          startedAt: new Date().toISOString()
        })
      : undefined
    const modelClient = await deps.createImageModelClient(model)
    const invocation = await modelClient.invoke(payload)
    await reportImageObservation(
      deps,
      invocation.observation,
      model,
      toolCallId,
      toolName,
      operation,
      pricingDimensions,
      pricingSnapshot
    )
    return { response: invocation.data }
  }
  const response = await directClient.generateImages(payload)
  await reportImageObservation(
    deps,
    normalizeSeedreamImageObservation(response),
    model,
    toolCallId,
    toolName,
    operation,
    {
      ...(normalizeString(payload.size) ? { resolution: normalizeString(payload.size) } : {}),
      ...(normalizeString(payload.sequential_image_generation)
        ? { mode: normalizeString(payload.sequential_image_generation) }
        : {})
    }
  )
  return { response }
}

async function finalizeImageGeneration(upload: () => Promise<SeedreamArtifactFile[]>) {
  return upload()
}

async function reportImageObservation(
  deps: SeedreamToolDependencies,
  observation: AIGCModelObservation,
  model: string,
  toolCallId: string | undefined,
  toolName: string,
  operation: ImageGenerationOperation,
  pricingDimensions: { resolution?: string; mode?: string },
  pricingSnapshot?: import('@xpert-ai/contracts').ModelUsagePricingSnapshot
) {
  if (!deps.modelProvider || !toolCallId || !observation.metrics?.length) return
  await deps.modelProvider.reportUsage({
    requestId: toolCallId,
    model,
    modelType: AiModelTypeEnum.IMAGE,
    toolName,
    operation,
    modality: 'image',
    pricingDimensions,
    pricingSnapshot,
    metrics: observation.metrics,
    recordedAt: new Date().toISOString()
  })
}

function requireString(value: unknown, message: string) {
  const normalized = normalizeString(value)
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool input must be an object')
  }
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    result[key] = Reflect.get(value, key)
  }
  return result
}

function parseVideoGenerationInput(input: Record<string, unknown>): VideoGenerationInput {
  return {
    model: readOptionalText(input.model),
    prompt: readOptionalText(input.prompt),
    resolution: readOptionalText(input.resolution),
    ratio: readOptionalText(input.ratio),
    duration: readStringOrNumber(input.duration),
    seed: readStringOrNumber(input.seed),
    camera_fixed: readStringOrBoolean(input.camera_fixed),
    watermark: readStringOrBoolean(input.watermark),
    generate_audio: readStringOrBoolean(input.generate_audio),
    draft: readStringOrBoolean(input.draft),
    return_last_frame: readStringOrBoolean(input.return_last_frame),
    service_tier: readOptionalText(input.service_tier),
    bitrate_mode: readOptionalText(input.bitrate_mode),
    output_format: readOptionalText(input.output_format),
    priority: readStringOrNumber(input.priority),
    web_search: readStringOrBoolean(input.web_search)
  }
}

function readOptionalText(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function readStringOrNumber(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? value : undefined
}

function readStringOrBoolean(value: unknown) {
  return typeof value === 'string' || typeof value === 'boolean' ? value : undefined
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value
  const number = typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : fallback
  return Math.min(Math.max(number, min), max)
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function queueJobId(requestId: string) {
  return `volcengine-${requestId.replace(/[^a-zA-Z0-9._-]/g, '-')}`
}

function isTerminalQueueState(state?: string) {
  return state === 'completed' || state === 'failed'
}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for Seedance video generation.')
  return queue
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {
        // Treat invalid JSON strings as a single input below.
      }
    }
  }
  return [value]
}

function parseUrlList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && !!item.trim()).map((item) => item.trim())
  }
  if (typeof value !== 'string') {
    return []
  }
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parsePublicHttpsUrlList(value: unknown, label: string) {
  return parseUrlList(value).map((value) => {
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      throw new Error(`Invalid ${label}: ${value}`)
    }
    if (parsed.protocol !== 'https:' || isPrivateReferenceHost(parsed.hostname)) {
      throw new Error(`${label} must be a public HTTPS URL`)
    }
    return parsed.toString()
  })
}

function isPrivateReferenceHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0.0.0.0' ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal') ||
    normalized.startsWith('127.') ||
    normalized.startsWith('10.') ||
    normalized.startsWith('192.168.') ||
    normalized.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
  )
}

function validateMultimodalInputs(
  model: string,
  modeRule: { label: string; needImage: boolean; needVideo: boolean; needAudio: boolean; audioOnly?: boolean },
  imageInputs: unknown[],
  videoUrls: string[],
  audioInputCount: number
) {
  const capabilities = getVideoModelCapabilities(model)
  if (modeRule.needImage && !imageInputs.length) {
    throw new Error(`${modeRule.label} requires at least one reference image`)
  }
  if (modeRule.needVideo && !videoUrls.length) {
    throw new Error(`${modeRule.label} requires at least one reference video URL`)
  }
  if (modeRule.needAudio && audioInputCount === 0) {
    throw new Error(`${modeRule.label} requires at least one reference audio`)
  }
  if (imageInputs.length > capabilities.maxReferenceImages) {
    throw new Error(`Reference images support at most ${capabilities.maxReferenceImages} files`)
  }
  if (videoUrls.length > capabilities.maxReferenceVideos) {
    throw new Error(`Reference video URLs support at most ${capabilities.maxReferenceVideos} values`)
  }
  if (audioInputCount > capabilities.maxReferenceAudios) {
    throw new Error(`Reference audios support at most ${capabilities.maxReferenceAudios} files or URLs`)
  }
  if (modeRule.audioOnly && !capabilities.supportsAudioOnly) {
    throw new Error('Audio-only input only supports Seedance 2.5')
  }
  if (modeRule.needAudio && !modeRule.audioOnly && !imageInputs.length && !videoUrls.length) {
    throw new Error('Audio cannot be used alone; at least one image or video reference is required')
  }
}

function inferMultimodalInputMode(imageCount: number, videoCount: number, audioCount: number) {
  if (imageCount && videoCount && audioCount) return 'text_image_video_audio'
  if (imageCount && videoCount) return 'text_image_video'
  if (imageCount && audioCount) return 'text_image_audio'
  if (videoCount && audioCount) return 'text_video_audio'
  if (imageCount) return 'text_image'
  if (videoCount) return 'text_video'
  if (audioCount) return 'text_audio'
  throw new Error('At least one image, video, or audio reference is required')
}
