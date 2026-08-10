import { randomUUID } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import { encodeImageInput } from './assets.js'
import { ZhipuCogVideoClient } from './client.js'
import type {
  ZhipuArtifactFile,
  ZhipuCogVideoToolDependencies,
  ZhipuCogVideoToolResult,
  ZhipuVideoGenerationPayload,
  ZhipuVideoTask
} from './types.js'
import { extensionFromMimeType, uploadGeneratedAsset } from './workspace-upload.js'

const VIDEO_FOLDER = 'files/zhipuai/cogvideo/videos'
const COVER_FOLDER = 'files/zhipuai/cogvideo/covers'
const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 5_000
const MAX_COVER_BYTES = 20 * 1024 * 1024

const VIDEO_MODELS = ['cogvideox-3', 'cogvideox-2', 'cogvideox-flash'] as const
const VIDEO_SIZES = [
  '720x480',
  '1024x1024',
  '1280x960',
  '960x1280',
  '1920x1080',
  '1080x1920',
  '2048x1080',
  '3840x2160'
] as const

type VideoModel = (typeof VIDEO_MODELS)[number]

export function buildZhipuCogVideoTools(deps: ZhipuCogVideoToolDependencies) {
  return [buildSubmitTool(deps), buildQueryTool(deps)]
}

function buildSubmitTool(deps: ZhipuCogVideoToolDependencies) {
  return tool(
    async (input: unknown): Promise<ZhipuCogVideoToolResult> => {
      const values = requireRecord(input)
      const prompt = readOptionalString(values.prompt)
      const imageInput = values.input_image_file ?? values.image_url
      if (!prompt && imageInput === undefined) {
        throw new Error('At least one of prompt, input_image_file, or image_url is required')
      }

      const model = normalizeModel(values.model)
      const payload: ZhipuVideoGenerationPayload = {
        model,
        request_id: randomUUID(),
        ...(prompt ? { prompt } : {}),
        ...(imageInput !== undefined
          ? {
              image_url: await encodeImageInput(imageInput, {
                fetchImpl: deps.fetch ?? fetch,
                workspaceFiles: deps.workspaceFiles,
                workspaceScope: deps.workspaceScope
              })
            }
          : {}),
        with_audio: normalizeBoolean(values.with_audio, false),
        duration: normalizeDuration(values.duration, model),
        ...(deps.workspaceScope?.userId ? { user_id: deps.workspaceScope.userId } : {})
      }

      if (model !== 'cogvideox-flash') {
        payload.quality = normalizeQuality(values.quality)
        const size = normalizeEnum(values.size, VIDEO_SIZES)
        const fps = normalizeFps(values.fps)
        if (size) payload.size = size
        if (fps) payload.fps = fps
      }

      const task = await createClient(deps).submitVideo(payload)
      const taskId = task.id
      if (!taskId) throw new Error('ZhipuAI did not return a video task ID')

      const message = [
        'ZhipuAI video generation task submitted.',
        `Task ID: ${taskId}`,
        'Call zhipu_cogvideo_query with this task_id to check completion and download the generated video.',
        'If it is still processing, report the task ID and wait for a later turn instead of submitting the same video again.'
      ].join('\n')

      return result(message, [], {
        task_id: taskId,
        status: task.task_status || 'PROCESSING',
        model: task.model || model,
        request_id: task.request_id || payload.request_id
      })
    },
    {
      name: 'zhipu_cogvideo_submit',
      description:
        'Submit a ZhipuAI CogVideoX text-to-video or image-to-video task. Returns a task ID; use zhipu_cogvideo_query to retrieve the result.',
      schema: submitSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildQueryTool(deps: ZhipuCogVideoToolDependencies) {
  return tool(
    async (input: unknown): Promise<ZhipuCogVideoToolResult> => {
      const values = requireRecord(input)
      const taskId = requireString(values.task_id, 'Task ID is required')
      const downloadVideo = normalizeBoolean(values.download_video, true)
      const waitSeconds = clampInteger(values.wait_seconds, 30, 0, QUERY_MAX_WAIT_SECONDS)
      const client = createClient(deps)
      const sleep = deps.sleep ?? delay

      let task = await client.getVideoTask(taskId)
      let remainingMs = waitSeconds * 1_000
      while (isProcessing(task) && remainingMs > 0) {
        const delayMs = Math.min(QUERY_POLL_MS, remainingMs)
        await sleep(delayMs)
        remainingMs -= delayMs
        task = await client.getVideoTask(taskId)
      }

      const resolvedTaskId = task.id || taskId
      const status = task.task_status || 'UNKNOWN'
      if (status === 'FAIL') {
        throw new Error(`ZhipuAI video generation task ${resolvedTaskId} failed${formatTaskError(task.error)}`)
      }

      if (status !== 'SUCCESS') {
        return result(
          `Video task ${resolvedTaskId} status: ${status}. The provider task continues running; query it again in a later turn.`,
          [],
          {
            task_id: resolvedTaskId,
            status,
            model: task.model
          }
        )
      }

      if (!task.video_result.length) {
        throw new Error(`ZhipuAI video task ${resolvedTaskId} succeeded without a video result`)
      }

      const files = downloadVideo ? await downloadTaskFiles(task, resolvedTaskId, client, deps) : []
      return result(
        `Video task ${resolvedTaskId} status: SUCCESS.${downloadVideo ? '' : ' Provider URLs are available in the result data.'}`,
        files,
        {
          task_id: resolvedTaskId,
          status,
          model: task.model,
          provider_video_urls: task.video_result.flatMap((item) => item.url ? [item.url] : []),
          cover_image_urls: task.video_result.flatMap((item) => item.cover_image_url ? [item.cover_image_url] : [])
        }
      )
    },
    {
      name: 'zhipu_cogvideo_query',
      description:
        'Query a ZhipuAI CogVideoX task. When complete, download generated videos and cover images into the Xpert workspace.',
      schema: querySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

async function downloadTaskFiles(
  task: ZhipuVideoTask,
  taskId: string,
  client: ZhipuCogVideoClient,
  deps: ZhipuCogVideoToolDependencies
) {
  const files: ZhipuArtifactFile[] = []
  const safeTaskId = sanitizeFileStem(taskId)

  for (const [index, item] of task.video_result.entries()) {
    if (!item.url) throw new Error(`ZhipuAI video result ${index + 1} is missing its URL`)

    const video = await client.downloadBuffer(item.url)
    const videoMimeType = video.mimeType || 'video/mp4'
    if (!videoMimeType.startsWith('video/')) {
      throw new Error(`ZhipuAI video result ${index + 1} returned an invalid MIME type`)
    }
    const suffix = task.video_result.length > 1 ? `-${index + 1}` : ''
    const videoFileName = `${safeTaskId}${suffix}.${extensionFromMimeType(videoMimeType)}`
    files.push(await uploadGeneratedAsset({
      workspaceFiles: deps.workspaceFiles,
      workspaceScope: deps.workspaceScope,
      buffer: video.buffer,
      mimeType: videoMimeType,
      folder: VIDEO_FOLDER,
      fileName: videoFileName,
      metadata: {
        source: 'zhipu_cogvideo_generation',
        taskId,
        model: task.model,
        resultIndex: index
      }
    }))

    if (item.cover_image_url) {
      const cover = await client.downloadBuffer(item.cover_image_url)
      const coverMimeType = cover.mimeType || 'image/jpeg'
      if (!coverMimeType.startsWith('image/')) {
        throw new Error(`ZhipuAI cover image ${index + 1} returned an invalid MIME type`)
      }
      if (cover.buffer.length > MAX_COVER_BYTES) {
        throw new Error(`ZhipuAI cover image ${index + 1} exceeds the 20MB limit`)
      }
      const coverFileName = `${safeTaskId}${suffix}-cover.${extensionFromMimeType(coverMimeType)}`
      files.push(await uploadGeneratedAsset({
        workspaceFiles: deps.workspaceFiles,
        workspaceScope: deps.workspaceScope,
        buffer: cover.buffer,
        mimeType: coverMimeType,
        folder: COVER_FOLDER,
        fileName: coverFileName,
        metadata: {
          source: 'zhipu_cogvideo_cover',
          taskId,
          model: task.model,
          resultIndex: index
        }
      }))
    }
  }

  return files
}

function result(
  message: string,
  files: ZhipuArtifactFile[],
  data?: Record<string, unknown>
): ZhipuCogVideoToolResult {
  return [formatResultContent(message, files), { files, ...(data ? { data } : {}) }]
}

function formatResultContent(message: string, files: ZhipuArtifactFile[]) {
  if (!files.length) return message

  const fileLines = files.map((file, index) => {
    const url = file.fileUrl || file.url
    const title = url ? `${index + 1}. ${file.fileName}: ${url}` : `${index + 1}. ${file.fileName}`
    const details = [
      `workspacePath: ${file.workspacePath}`,
      `filePath: ${file.filePath}`,
      `mimeType: ${file.mimeType}`,
      ...(file.catalog ? [`catalog: ${file.catalog}`] : []),
      ...(file.scopeId ? [`scopeId: ${file.scopeId}`] : [])
    ]
    const preview = url && file.mimeType.startsWith('image/') ? `\n![${file.fileName}](${url})` : ''
    return `${title}\n${details.join('\n')}${preview}`
  })

  return `${message}\n\nGenerated files:\n${fileLines.join('\n')}`
}

function createClient(deps: ZhipuCogVideoToolDependencies) {
  return new ZhipuCogVideoClient(deps.credentials, deps.fetch ?? fetch)
}

function isProcessing(task: ZhipuVideoTask) {
  return task.task_status === 'PROCESSING' && !task.video_result.some((item) => item.url)
}

function normalizeModel(value: unknown): VideoModel {
  return normalizeEnum(value, VIDEO_MODELS) || 'cogvideox-flash'
}

function normalizeQuality(value: unknown): 'quality' | 'speed' {
  return value === 'quality' ? 'quality' : 'speed'
}

function normalizeDuration(value: unknown, model: VideoModel) {
  if (model !== 'cogvideox-3') return 5
  return normalizeNumber(value) === 10 ? 10 : 5
}

function normalizeFps(value: unknown) {
  const fps = normalizeNumber(value)
  return fps === 30 || fps === 60 ? fps : undefined
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') return true
    if (value.trim().toLowerCase() === 'false') return false
  }
  return fallback
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? value as T : undefined
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = normalizeNumber(value)
  return number === undefined ? fallback : Math.min(Math.max(Math.trunc(number), minimum), maximum)
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Tool input must be an object')
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, message: string) {
  const result = readOptionalString(value)
  if (!result) throw new Error(message)
  return result
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function sanitizeFileStem(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '')
  return sanitized.slice(0, 160) || 'zhipu-video'
}

function formatTaskError(value: unknown) {
  if (typeof value === 'string' && value.trim()) return `: ${value.trim()}`
  if (value && typeof value === 'object' && !Array.isArray(value) && 'message' in value) {
    const message = value.message
    if (typeof message === 'string' && message.trim()) return `: ${message.trim()}`
  }
  return ''
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function i18n(en_US: string, zh_Hans: string) {
  return { en_US, zh_Hans }
}

function booleanProperty(title: string, titleZh: string, description: string, descriptionZh: string, defaultValue: boolean) {
  return {
    type: ['boolean', 'string'],
    title,
    description,
    default: defaultValue,
    'x-ui': {
      title: i18n(title, titleZh),
      description: i18n(description, descriptionZh)
    }
  } as const
}

const submitSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string',
      maxLength: 2_000,
      title: 'Prompt',
      description: 'Text prompt for video generation. Optional when an image is provided.',
      'x-ui': {
        title: i18n('Prompt', '提示词'),
        description: i18n(
          'Text prompt for video generation. Optional when an image is provided.',
          '用于生成视频的提示词；提供图片时可以省略。'
        )
      }
    },
    input_image_file: {
      anyOf: [{ type: 'string' }, { type: 'object' }],
      title: 'Reference image',
      description: 'Workspace image file, path, URL, Buffer, or data URL.',
      'x-ui': {
        title: i18n('Reference image', '参考图片'),
        description: i18n(
          'Workspace image file, path, URL, Buffer, or data URL.',
          'Workspace 图片文件、路径、URL、Buffer 或 data URL。'
        )
      }
    },
    image_url: {
      type: 'string',
      title: 'Image URL',
      description: 'Public HTTPS image URL. Use input_image_file for Workspace images.',
      'x-ui': {
        title: i18n('Image URL', '图片 URL'),
        description: i18n(
          'Public HTTPS image URL. Use input_image_file for Workspace images.',
          '公网 HTTPS 图片 URL；Workspace 图片请使用参考图片字段。'
        )
      }
    },
    model: {
      type: 'string',
      enum: VIDEO_MODELS,
      default: 'cogvideox-flash',
      title: 'Model',
      'x-ui': {
        title: i18n('Model', '模型'),
        enumLabels: {
          'cogvideox-3': 'CogVideoX 3',
          'cogvideox-2': 'CogVideoX 2',
          'cogvideox-flash': 'CogVideoX Flash'
        }
      }
    },
    quality: {
      type: 'string',
      enum: ['quality', 'speed'],
      default: 'speed',
      title: 'Quality mode',
      description: 'Ignored for cogvideox-flash.',
      'x-ui': {
        title: i18n('Quality mode', '输出模式'),
        description: i18n('Ignored for cogvideox-flash.', 'CogVideoX Flash 不支持该参数。'),
        enumLabels: {
          quality: i18n('Quality first', '质量优先'),
          speed: i18n('Speed first', '速度优先')
        }
      }
    },
    with_audio: booleanProperty('Generate audio', '生成音效', 'Generate AI sound effects.', '是否生成 AI 音效。', false),
    size: {
      type: 'string',
      enum: VIDEO_SIZES,
      title: 'Video size',
      description: 'Ignored for cogvideox-flash.',
      'x-ui': {
        title: i18n('Video size', '视频尺寸'),
        description: i18n('Ignored for cogvideox-flash.', 'CogVideoX Flash 不支持该参数。')
      }
    },
    fps: {
      type: ['integer', 'string'],
      enum: [30, 60],
      title: 'FPS',
      description: 'Ignored for cogvideox-flash.',
      'x-ui': {
        title: i18n('FPS', '视频帧率'),
        description: i18n('Ignored for cogvideox-flash.', 'CogVideoX Flash 不支持该参数。')
      }
    },
    duration: {
      type: ['integer', 'string'],
      enum: [5, 10],
      default: 5,
      title: 'Duration',
      description: 'CogVideoX 2 and Flash only support 5 seconds.',
      'x-ui': {
        title: i18n('Duration', '视频时长'),
        description: i18n(
          'CogVideoX 2 and Flash only support 5 seconds.',
          'CogVideoX 2 和 Flash 仅支持 5 秒。'
        )
      }
    }
  }
} as const

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_id: {
      type: 'string',
      title: 'Task ID',
      description: 'Video generation task ID returned by zhipu_cogvideo_submit.',
      'x-ui': {
        title: i18n('Task ID', '任务 ID'),
        description: i18n(
          'Video generation task ID returned by zhipu_cogvideo_submit.',
          'zhipu_cogvideo_submit 返回的视频生成任务 ID。'
        )
      }
    },
    wait_seconds: {
      type: ['integer', 'string'],
      minimum: 0,
      maximum: QUERY_MAX_WAIT_SECONDS,
      default: 30,
      title: 'Bounded wait',
      description: 'Wait up to this many seconds while the durable provider task continues.',
      'x-ui': {
        title: i18n('Bounded wait', '有界等待'),
        description: i18n(
          'Wait up to 45 seconds while the durable provider task continues.',
          '最多等待 45 秒；智谱任务会在后台继续运行。'
        )
      }
    },
    download_video: booleanProperty(
      'Download video',
      '下载视频',
      'Download completed videos and cover images into the Workspace.',
      '将已完成的视频和封面保存到 Workspace。',
      true
    )
  },
  required: ['task_id']
} as const
