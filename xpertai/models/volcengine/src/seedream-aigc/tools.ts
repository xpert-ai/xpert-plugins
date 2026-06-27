import { tool } from '@langchain/core/tools'
import { SeedreamArkClient } from './client.js'
import { inputToBuffer, bufferToDataUrl, enforceMaxBytes, createGeneratedFileName } from './assets.js'
import { normalizeBoolean, normalizeString, normalizeVideoGenerationOptions, isSeedance2Model } from './rules.js'
import { uploadGeneratedAsset } from './workspace-upload.js'
import type { SeedreamArtifactFile, SeedreamToolDependencies, SeedreamToolResult } from './types.js'

const IMAGE_FOLDER = 'files/seedream-aigc/images'
const VIDEO_FOLDER = 'files/seedream-aigc/videos'
const IMAGE_LIMIT_BYTES = 10 * 1024 * 1024
const MULTIMODAL_IMAGE_LIMIT_BYTES = 30 * 1024 * 1024
const AUDIO_LIMIT_BYTES = 15 * 1024 * 1024
const MULTIMODAL_MODE_RULES: Record<string, { label: string; needImage: boolean; needVideo: boolean; needAudio: boolean }> = {
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
    async (input: any): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const client = createClient(deps)
      const response = await client.generateImages({
        model: normalizeString(input.model) ?? 'doubao-seedream-4-5-251128',
        prompt,
        size: normalizeString(input.size) ?? '2048x2048',
        sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled',
        stream: false,
        response_format: 'url',
        watermark: normalizeBoolean(input.watermark, true)
      })
      const files = await uploadImageOutputs(response, client, deps, 'seedream-text-to-image', 'url')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const image = await encodeImageInput(input.input_image_file, deps, IMAGE_LIMIT_BYTES, 'input image')
      const client = createClient(deps)
      const response = await client.generateImages({
        model: normalizeString(input.model) ?? 'doubao-seedream-4-5-251128',
        prompt,
        image,
        size: normalizeString(input.size) ?? '2048x2048',
        sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled',
        stream: false,
        response_format: 'b64_json',
        watermark: normalizeBoolean(input.watermark, true)
      })
      const files = await uploadImageOutputs(response, client, deps, 'seedream-image-to-image', 'b64_json')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const images = await encodeImageInputs(input.input_image_files, deps, IMAGE_LIMIT_BYTES, 2, 14)
      const client = createClient(deps)
      const response = await client.generateImages({
        model: normalizeString(input.model) ?? 'doubao-seedream-4-5-251128',
        prompt,
        image: images,
        size: normalizeString(input.size) ?? '2048x2048',
        sequential_image_generation: normalizeString(input.sequential_image_generation) ?? 'disabled',
        response_format: 'b64_json',
        watermark: normalizeBoolean(input.watermark, true)
      })
      const files = await uploadImageOutputs(response, client, deps, 'seedream-multi-images-to-image', 'b64_json')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const images = await encodeImageInputs(input.input_image_files, deps, IMAGE_LIMIT_BYTES, 2, 14)
      const maxImages = clampNumber(input.max_images, 3, 1, 15)
      const client = createClient(deps)
      const response = await client.generateImages({
        model: normalizeString(input.model) ?? 'doubao-seedream-4-5-251128',
        prompt,
        image: images,
        size: normalizeString(input.size) ?? '2048x2048',
        sequential_image_generation: 'auto',
        sequential_image_generation_options: { max_images: maxImages },
        response_format: 'b64_json',
        watermark: normalizeBoolean(input.watermark, true)
      })
      const files = await uploadImageOutputs(response, client, deps, 'seedream-multi-images-to-multi-images', 'b64_json')
      return result(`Generated ${files.length} image(s).`, files, { usage: response?.usage })
    },
    {
      name: 'seedream_multi_images_to_multi_images',
      description: 'Generate a group of images from text and multiple reference images using Volcengine Doubao Seedream models.',
      schema: multiImagesToMultiImagesSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildTextToVideoTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any): Promise<SeedreamToolResult> => {
      const options = normalizeVideoGenerationOptions(input)
      if (!options.prompt) throw new Error('Prompt is required')
      const task = await createClient(deps).createVideoTask(createVideoPayload(options, [{ type: 'text', text: options.prompt }]))
      return videoSubmittedResult(task, 'Text-to-video task submitted.')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const options = normalizeVideoGenerationOptions(input)
      if (!options.prompt) throw new Error('Prompt is required')
      const image = await encodeImageInput(input.input_image_file, deps, IMAGE_LIMIT_BYTES, 'input image')
      const task = await createClient(deps).createVideoTask(
        createVideoPayload(options, [
          { type: 'text', text: options.prompt },
          { type: 'image_url', image_url: { url: image } }
        ])
      )
      return videoSubmittedResult(task, 'Image-to-video task submitted.')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const options = normalizeVideoGenerationOptions(input)
      if (!options.prompt) throw new Error('Prompt is required')
      const firstFrame = await encodeImageInput(input.first_frame_file, deps, IMAGE_LIMIT_BYTES, 'first frame')
      const lastFrame = await encodeImageInput(input.last_frame_file, deps, IMAGE_LIMIT_BYTES, 'last frame')
      const task = await createClient(deps).createVideoTask(
        createVideoPayload(options, [
          { type: 'text', text: options.prompt },
          { type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' },
          { type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' }
        ])
      )
      return videoSubmittedResult(task, 'First-last-frame video task submitted.')
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
    async (input: any): Promise<SeedreamToolResult> => {
      const options = normalizeVideoGenerationOptions({
        ...input,
        model: input.model ?? 'doubao-seedance-2-0-260128',
        ratio: input.ratio ?? 'adaptive'
      })
      if (!isSeedance2Model(options.model)) {
        throw new Error('Multimodal reference video only supports Seedance 2.0 models')
      }
      const mode = normalizeString(input.input_mode) ?? 'text_image_video'
      const modeRule = MULTIMODAL_MODE_RULES[mode]
      if (!modeRule) {
        throw new Error('Invalid multimodal input mode')
      }
      const imageInputs = toArray(input.reference_image_files)
      const videoUrls = parseUrlList(input.reference_video_urls)
      const audioInputs = toArray(input.reference_audio_files)
      validateMultimodalInputs(modeRule, imageInputs, videoUrls, audioInputs)
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
      const task = await createClient(deps).createVideoTask(createVideoPayload(options, content))
      return videoSubmittedResult(task, 'Multimodal reference video task submitted.')
    },
    {
      name: 'seedance_multimodal_reference_to_video',
      description: 'Submit a Seedance 2.0 multimodal reference video task and return the task id.',
      schema: multimodalReferenceToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildVideoQueryTool(deps: SeedreamToolDependencies) {
  return tool(
    async (input: any): Promise<SeedreamToolResult> => {
      const taskId = requireString(input.task_id, 'Task id is required')
      const downloadVideo = normalizeBoolean(input.download_video, true)
      const client = createClient(deps)
      const task = await client.getVideoTask(taskId)
      const files: SeedreamArtifactFile[] = []
      const videoUrl = task?.content?.video_url
      if (downloadVideo && typeof videoUrl === 'string' && videoUrl) {
        const { buffer, mimeType } = await client.downloadBuffer(videoUrl)
        const resolvedMimeType = mimeType || 'video/mp4'
        files.push(
          await uploadGeneratedAsset({
            workspaceFiles: deps.workspaceFiles,
            workspaceScope: deps.workspaceScope,
            buffer,
            mimeType: resolvedMimeType,
            folder: VIDEO_FOLDER,
            fileName: `${task?.id ?? taskId}.mp4`,
            metadata: {
              source: 'ark_video_generation',
              taskId: task?.id ?? taskId,
              arkUrl: videoUrl
            }
          })
        )
      }
      const resolvedTaskId = task?.id ?? taskId
      const message = videoUrl
        ? `Video task ${resolvedTaskId} status: ${task?.status ?? 'unknown'}.`
        : `Video task ${resolvedTaskId} status: ${task?.status ?? 'unknown'}.\nNo video_url is available yet. Do not repeat seedance_video_query with the same task_id in this turn; report the current status and Task ID to the user.`
      return result(message, files, {
        task_id: resolvedTaskId,
        status: task?.status,
        video_url: videoUrl,
        last_frame_url: task?.content?.last_frame_url,
        model: task?.model,
        error: task?.error,
        usage: task?.usage
      })
    },
    {
      name: 'seedance_video_query',
      description: 'Query a Seedance video generation task and upload the completed video to the workspace when available.',
      schema: videoQuerySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

const IMAGE_SIZE_OPTIONS = [
  ['2048x2048', '1:1 (2048x2048)'],
  ['2304x1728', '4:3 (2304x1728)'],
  ['1728x2304', '3:4 (1728x2304)'],
  ['2560x1440', '16:9 (2560x1440)'],
  ['1440x2560', '9:16 (1440x2560)'],
  ['2496x1664', '3:2 (2496x1664)'],
  ['1664x2496', '2:3 (1664x2496)'],
  ['3024x1296', '21:9 (3024x1296)']
] as const

const SEEDREAM_MODEL_OPTIONS = [
  ['doubao-seedream-4-0-250828', 'Seedream4.0'],
  ['doubao-seedream-4-5-251128', 'Seedream4.5'],
  ['doubao-seedream-5-0-lite-260128', 'Seedream5.0 Lite']
] as const

const SEEDANCE_MODEL_OPTIONS = [
  ['doubao-seedance-1-5-pro-251215', 'Seedance1.5 Pro'],
  ['doubao-seedance-2-0-260128', 'Seedance2.0'],
  ['doubao-seedance-2-0-fast-260128', 'Seedance2.0 Fast']
] as const

const SEEDANCE_2_MODEL_OPTIONS = [
  ['doubao-seedance-2-0-260128', 'Seedance2.0'],
  ['doubao-seedance-2-0-fast-260128', 'Seedance2.0 Fast']
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
        anyOf: [
          { type: 'string' },
          { type: 'object' }
        ]
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

function imageSchema(properties: Record<string, unknown>, required = ['prompt']) {
  return {
    type: 'object',
    properties,
    required
  } as const
}

const imageSettingsProperties = {
  size: sizeProperty,
  watermark: watermarkProperty,
  model: modelProperty
}

const textToImageSchema = imageSchema({
  prompt: promptProperty,
  ...imageSettingsProperties
})

const imageToImageSchema = imageSchema({
  prompt: promptProperty,
  input_image_file: singleReferenceImageProperty,
  ...imageSettingsProperties
}, ['prompt', 'input_image_file'])

const multiImagesToImageSchema = imageSchema({
  prompt: promptProperty,
  input_image_files: referenceImagesProperty,
  ...imageSettingsProperties
}, ['prompt', 'input_image_files'])

const multiImagesToMultiImagesSchema = imageSchema({
  prompt: promptProperty,
  input_image_files: referenceImagesProperty,
  size: sizeProperty,
  max_images: maxImagesProperty,
  watermark: watermarkProperty,
  model: modelProperty
}, ['prompt', 'input_image_files'])

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
  type: 'integer',
  title: 'Duration',
  description: 'Video duration in seconds.',
  minimum: 2,
  maximum: 15,
  default: 5,
  'x-ui': {
    title: i18n('Duration', '视频时长'),
    description: i18n('Video duration in seconds.', '生成视频的时长，单位为秒。')
  }
} as const

const videoSeedProperty = {
  type: 'integer',
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
  camera_fixed: booleanSelectProperty('Fixed camera', '固定镜头', 'Whether to fix camera position.', '是否固定镜头位置。', 'false'),
  watermark: booleanSelectProperty('Watermark', '水印', 'Whether to add watermark.', '是否添加水印。', 'true'),
  generate_audio: booleanSelectProperty('Generate audio', '生成音频', 'Whether to generate synchronized audio.', '是否生成同步音频。', 'true'),
  draft: booleanSelectProperty('Draft mode', '草稿模式', 'Whether to use draft mode.', '是否使用草稿模式。', 'false'),
  return_last_frame: booleanSelectProperty('Return last frame', '返回尾帧', 'Whether to return last frame.', '是否返回尾帧。', 'false'),
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
  }
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
  default: 'text_image_video',
  'x-ui': {
    title: i18n('Input mode', '输入模式'),
    description: i18n('Multimodal input combination.', '多模态参考素材组合方式。'),
    enumLabels: {
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
  maxItems: 9,
  items: {},
  title: 'Reference images',
  description: 'Reference images.',
  'x-ui': {
    title: i18n('Reference images', '参考图片'),
    description: i18n('Reference images.', '视频生成参考图片，最多 9 张。')
  }
} as const

const multimodalReferenceVideoUrlsProperty = {
  type: 'string',
  title: 'Reference video URLs',
  description: 'Reference video URLs separated by comma or newline.',
  'x-ui': {
    title: i18n('Reference video URLs', '参考视频 URL'),
    description: i18n(
      'Reference video URLs separated by comma or newline.',
      '参考视频 URL，可用英文逗号或换行分隔。'
    )
  }
} as const

const multimodalReferenceAudioFilesProperty = {
  type: 'array',
  maxItems: 3,
  items: {},
  title: 'Reference audio files',
  description: 'Reference audio files.',
  'x-ui': {
    title: i18n('Reference audio files', '参考音频'),
    description: i18n('Reference audio files.', '视频生成参考音频文件，最多 3 个。')
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

const imageToVideoSchema = videoObjectSchema({
  ...videoCommonProperties,
  input_image_file: videoReferenceImageProperty
}, ['prompt', 'input_image_file'])

const firstLastFrameToVideoSchema = videoObjectSchema({
  ...videoCommonProperties,
  first_frame_file: firstFrameProperty,
  last_frame_file: lastFrameProperty
}, ['prompt', 'first_frame_file', 'last_frame_file'])

const multimodalReferenceToVideoSchema = videoObjectSchema({
  ...videoCommonProperties,
  model: seedance2ModelProperty,
  ratio: multimodalVideoRatioProperty,
  input_mode: multimodalInputModeProperty,
  reference_image_files: multimodalReferenceImagesProperty,
  reference_video_urls: multimodalReferenceVideoUrlsProperty,
  reference_audio_files: multimodalReferenceAudioFilesProperty
}, [])

const videoTaskIdProperty = {
  type: 'string',
  title: 'Task ID',
  description: 'The video generation task id.',
  'x-ui': {
    title: i18n('Task ID', '任务 ID'),
    description: i18n('The video generation task id.', '视频生成任务 ID。')
  }
} as const

const videoQuerySchema = videoObjectSchema({
  task_id: videoTaskIdProperty,
  download_video: booleanSelectProperty(
    'Download video',
    '下载视频',
    'Whether to download and upload the video.',
    '是否下载并上传视频。',
    'true'
  )
}, ['task_id'])

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

async function uploadImageOutputs(
  response: any,
  client: SeedreamArkClient,
  deps: SeedreamToolDependencies,
  filePrefix: string,
  expectedFormat: 'url' | 'b64_json'
) {
  const data = Array.isArray(response?.data) ? response.data : []
  if (!data.length) {
    throw new Error('Ark API did not return generated image data')
  }
  const files: SeedreamArtifactFile[] = []
  for (const [index, item] of data.entries()) {
    let buffer: Buffer
    let mimeType = 'image/png'
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

function createVideoPayload(options: ReturnType<typeof normalizeVideoGenerationOptions>, content: Record<string, unknown>[]) {
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
    payload.camera_fixed = options.camera_fixed
    payload.service_tier = options.service_tier
  }
  return payload
}

function videoSubmittedResult(task: any, message: string): SeedreamToolResult {
  const taskId = task?.id
  const content = taskId
    ? `${message}\nTask ID: ${taskId}\nCall seedance_video_query once with this task_id to check completion and download the generated video.\nIf the task is not completed or no video_url is returned, stop and tell the user the task is still processing. Do not repeat the same query in this turn.`
    : message
  return result(content, [], {
    task_id: task?.id,
    status: task?.status ?? 'submitted',
    model: task?.model
  })
}

function result(message: string, files: SeedreamArtifactFile[], data?: Record<string, unknown>): SeedreamToolResult {
  return [formatResultContent(message, files), { files, ...(data ? { data } : {}) }]
}

function formatResultContent(message: string, files: SeedreamArtifactFile[]) {
  if (!files.length) {
    return message
  }

  const fileLines = files
    .map((file, index) => {
      const url = file.fileUrl ?? file.url
      if (!url) {
        return `${index + 1}. ${file.fileName}`
      }
      return isImageFile(file)
        ? `${index + 1}. ${file.fileName}: ${url}\n![${file.fileName}](${url})`
        : `${index + 1}. ${file.fileName}: ${url}`
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

function requireString(value: unknown, message: string) {
  const normalized = normalizeString(value)
  if (!normalized) {
    throw new Error(message)
  }
  return normalized
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(Math.max(number, min), max)
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

function validateMultimodalInputs(
  modeRule: { label: string; needImage: boolean; needVideo: boolean; needAudio: boolean },
  imageInputs: unknown[],
  videoUrls: string[],
  audioInputs: unknown[]
) {
  if (modeRule.needImage && !imageInputs.length) {
    throw new Error(`${modeRule.label} requires at least one reference image`)
  }
  if (modeRule.needVideo && !videoUrls.length) {
    throw new Error(`${modeRule.label} requires at least one reference video URL`)
  }
  if (modeRule.needAudio && !audioInputs.length) {
    throw new Error(`${modeRule.label} requires at least one reference audio`)
  }
  if (imageInputs.length > 9) {
    throw new Error('Reference images support at most 9 files')
  }
  if (videoUrls.length > 3) {
    throw new Error('Reference video URLs support at most 3 values')
  }
  if (audioInputs.length > 3) {
    throw new Error('Reference audios support at most 3 files')
  }
  if (modeRule.needAudio && !imageInputs.length && !videoUrls.length) {
    throw new Error('Audio cannot be used alone; at least one image or video reference is required')
  }
}
