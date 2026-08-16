import { randomUUID } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import { getToolCallIdFromConfig } from '@xpert-ai/contracts'
import { encodeImageInput } from './assets.js'
import type {
  ZhipuArtifactFile,
  ZhipuCogVideoToolDependencies,
  ZhipuCogVideoToolResult,
  ZhipuVideoGenerationPayload,
  ZhipuVideoJobPayload
} from './types.js'
import { ZHIPUAI_PLUGIN_NAME, ZHIPUAI_VIDEO_JOB, ZHIPUAI_VIDEO_QUEUE } from './constants.js'

const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 1_000

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
    async (input: unknown, config): Promise<ZhipuCogVideoToolResult> => {
      const values = requireRecord(input)
      const prompt = readOptionalString(values.prompt)
      const imageInput = values.input_image_file ?? values.image_url
      if (!prompt && imageInput === undefined) {
        throw new Error('At least one of prompt, input_image_file, or image_url is required')
      }

      const model = normalizeModel(values.model)
      const invocationKey = getToolCallIdFromConfig(config) ?? randomUUID()
      const payload: ZhipuVideoGenerationPayload = {
        model,
        request_id: invocationKey,
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

      const operation = imageInput === undefined ? 'text_to_video' : 'image_to_video'
      const taskId = queueJobId(invocationKey)
      const runtimeScope = deps.runtimeScope ?? {}
      await requireManagedQueue(deps.managedQueue).enqueue({
        pluginName: ZHIPUAI_PLUGIN_NAME,
        queueName: ZHIPUAI_VIDEO_QUEUE,
        jobName: ZHIPUAI_VIDEO_JOB,
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
          model,
          toolName: 'zhipu_cogvideo_submit',
          modality: 'video',
          operation,
          pricingDimensions: {
            durationSeconds: payload.duration,
            audio: payload.with_audio,
            ...(payload.size ? { resolution: payload.size } : {}),
            ...(payload.quality ? { mode: payload.quality } : {})
          },
          input: payload,
          phase: 'queued',
          startedAt: new Date().toISOString(),
          runtimeScope
        }
      })

      const message = [
        'ZhipuAI video generation task queued.',
        `Task ID: ${taskId}`,
        'Call zhipu_cogvideo_query with this task_id to check completion and download the generated video.',
        'The Managed Queue job submits and polls the provider task without occupying the conversation request.'
      ].join('\n')

      return zhipuCogVideoResult(message, [], {
        task_id: taskId,
        status: 'queued',
        model,
        request_id: payload.request_id
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
      const waitSeconds = clampInteger(values.wait_seconds, 30, 0, QUERY_MAX_WAIT_SECONDS)
      const sleep = deps.sleep ?? delay
      const managedQueue = requireManagedQueue(deps.managedQueue)

      let snapshot = await managedQueue.getJob<ZhipuVideoJobPayload>({ jobId: taskId })
      let remainingMs = waitSeconds * 1_000
      while (snapshot && !isTerminalQueueState(snapshot.state) && remainingMs > 0) {
        const delayMs = Math.min(QUERY_POLL_MS, remainingMs)
        await sleep(delayMs)
        remainingMs -= delayMs
        snapshot = await managedQueue.getJob<ZhipuVideoJobPayload>({ jobId: taskId })
      }

      if (!snapshot) throw new Error(`ZhipuAI video generation task ${taskId} was not found`)
      if (snapshot.state === 'completed' && snapshot.data.result) return snapshot.data.result
      if (snapshot.state === 'failed') {
        throw new Error(snapshot.failedReason || snapshot.data.errorCode || `ZhipuAI video task ${taskId} failed`)
      }
      return zhipuCogVideoResult(
        `Video task ${taskId} status: ${snapshot.data.providerState || snapshot.data.phase}. Query the same task ID later.`,
        [],
        {
          task_id: taskId,
          request_id: snapshot.data.requestId,
          provider_request_id: snapshot.data.providerRequestId,
          status: snapshot.data.providerState || snapshot.data.phase
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

export function zhipuCogVideoResult(
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
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
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
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(value)) {
    result[key] = Reflect.get(value, key)
  }
  return result
}

function requireString(value: unknown, message: string) {
  const result = readOptionalString(value)
  if (!result) throw new Error(message)
  return result
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function queueJobId(requestId: string) {
  return `zhipuai-${requestId.replace(/[^a-zA-Z0-9._-]/g, '-')}`
}

function isTerminalQueueState(state?: string) {
  return state === 'completed' || state === 'failed'
}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for ZhipuAI video generation.')
  return queue
}

function i18n(en_US: string, zh_Hans: string) {
  return { en_US, zh_Hans }
}

function booleanProperty(
  title: string,
  titleZh: string,
  description: string,
  descriptionZh: string,
  defaultValue: boolean
) {
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
    with_audio: booleanProperty(
      'Generate audio',
      '生成音效',
      'Generate AI sound effects.',
      '是否生成 AI 音效。',
      false
    ),
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
      type: 'integer',
      enum: [30, 60],
      title: 'FPS',
      description: 'Ignored for cogvideox-flash.',
      'x-ui': {
        title: i18n('FPS', '视频帧率'),
        description: i18n('Ignored for cogvideox-flash.', 'CogVideoX Flash 不支持该参数。')
      }
    },
    duration: {
      type: 'integer',
      enum: [5, 10],
      default: 5,
      title: 'Duration',
      description: 'CogVideoX 2 and Flash only support 5 seconds.',
      'x-ui': {
        title: i18n('Duration', '视频时长'),
        description: i18n('CogVideoX 2 and Flash only support 5 seconds.', 'CogVideoX 2 和 Flash 仅支持 5 秒。')
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
    model: {
      type: 'string',
      enum: VIDEO_MODELS,
      default: 'cogvideox-flash',
      title: 'Model'
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
