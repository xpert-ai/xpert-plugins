import { tool } from '@langchain/core/tools'
import { encodeImageInput } from './assets.js'
import { SiliconflowVideoClient } from './client.js'
import type {
  SiliconflowArtifactFile,
  SiliconflowVideoGenerationPayload,
  SiliconflowVideoModel,
  SiliconflowVideoTask,
  SiliconflowVideoToolDependencies,
  SiliconflowVideoToolResult
} from './types.js'
import {
  SiliconflowVideoImageModel,
  SiliconflowVideoModels,
  SiliconflowVideoSizes,
  SiliconflowVideoTextModel
} from './types.js'
import { extensionFromMimeType, uploadGeneratedAsset } from './workspace-upload.js'

const VIDEO_FOLDER = 'files/siliconflow/videos'
const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 5_000

const imageFileDescriptorSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    workspacePath: {
      type: 'string',
      description: 'Sandbox-visible Workspace image path, usually beginning with /workspace/. Prefer this locator.'
    },
    filePath: {
      type: 'string',
      description: 'Workspace-relative image path.'
    },
    path: {
      type: 'string',
      description: 'Workspace or sandbox-visible image path alias.'
    },
    url: {
      type: 'string',
      description: 'Public HTTPS image URL. Use workspacePath for Xpert Workspace images.'
    },
    fileUrl: {
      type: 'string',
      description: 'Public HTTPS image URL alias.'
    },
    mimeType: {
      type: 'string',
      description: 'Optional image MIME type.'
    },
    mimetype: {
      type: 'string',
      description: 'Optional image MIME type alias.'
    },
    name: {
      type: 'string',
      description: 'Optional image file name.'
    },
    originalName: {
      type: 'string',
      description: 'Optional original image file name.'
    }
  }
} as const

export function buildSiliconflowVideoTools(deps: SiliconflowVideoToolDependencies) {
  return [buildSubmitTool(deps), buildQueryTool(deps)]
}

function buildSubmitTool(deps: SiliconflowVideoToolDependencies) {
  return tool(
    async (input: unknown): Promise<SiliconflowVideoToolResult> => {
      const values = requireRecord(input)
      const prompt = readOptionalString(values.prompt)
      const imageInput = values.input_image_file ?? values.image_url
      if (!prompt && imageInput === undefined) {
        throw new Error('At least one of prompt, input_image_file, or image_url is required')
      }

      const model = normalizeModel(values.model, imageInput !== undefined)
      if (model === SiliconflowVideoImageModel && imageInput === undefined) {
        throw new Error('An input image is required for the SiliconFlow image-to-video model')
      }
      if (model === SiliconflowVideoTextModel && imageInput !== undefined) {
        throw new Error('Use the SiliconFlow image-to-video model when an input image is provided')
      }

      const payload: SiliconflowVideoGenerationPayload = {
        model,
        prompt: prompt || 'Create a natural, cinematic motion from the supplied image.',
        ...(readOptionalString(values.negative_prompt)
          ? { negative_prompt: readOptionalString(values.negative_prompt) }
          : {}),
        image_size: normalizeEnum(values.image_size, SiliconflowVideoSizes) || '1280x720',
        ...(imageInput !== undefined
          ? {
              image: await encodeImageInput(imageInput, {
                fetchImpl: deps.fetch ?? fetch,
                workspaceFiles: deps.workspaceFiles,
                workspaceScope: deps.workspaceScope
              })
            }
          : {}),
        ...(normalizeInteger(values.seed) !== undefined ? { seed: normalizeInteger(values.seed) } : {})
      }

      const task = await createClient(deps).submitVideo(payload)
      const requestId = task.requestId
      if (!requestId) throw new Error('SiliconFlow did not return a requestId')

      const message = [
        'SiliconFlow video generation task submitted.',
        `Task ID: ${requestId}`,
        'Call siliconflow_video_query with this task_id to check completion and download the generated video.',
        'If it is still processing, query the same task ID instead of submitting the video again.'
      ].join('\n')

      return result(message, [], {
        task_id: requestId,
        request_id: requestId,
        status: task.status || 'InQueue',
        model
      })
    },
    {
      name: 'siliconflow_video_submit',
      description:
        'Submit a SiliconFlow Wan2.2 text-to-video or image-to-video task. Returns a task ID; use siliconflow_video_query to retrieve the result.',
      schema: submitSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildQueryTool(deps: SiliconflowVideoToolDependencies) {
  return tool(
    async (input: unknown): Promise<SiliconflowVideoToolResult> => {
      const values = requireRecord(input)
      const taskId = requireString(values.task_id ?? values.request_id, 'Task ID is required')
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

      const resolvedTaskId = task.requestId || taskId
      const status = task.status || 'UNKNOWN'
      if (status === 'Failed') {
        throw new Error(`SiliconFlow video generation task ${resolvedTaskId} failed${formatTaskError(task.reason)}`)
      }

      if (status !== 'Succeed') {
        return result(
          `Video task ${resolvedTaskId} status: ${status}. The provider task continues running; query it again in a later turn.`,
          [],
          {
            task_id: resolvedTaskId,
            request_id: resolvedTaskId,
            status
          }
        )
      }

      if (!task.results.videos.length) {
        throw new Error(`SiliconFlow video task ${resolvedTaskId} succeeded without a video result`)
      }

      const files = downloadVideo ? await downloadTaskFiles(task, resolvedTaskId, client, deps) : []
      return result(
        `Video task ${resolvedTaskId} status: Succeed.${downloadVideo ? '' : ' Provider URLs are available in the result data.'}`,
        files,
        {
          task_id: resolvedTaskId,
          request_id: resolvedTaskId,
          status,
          provider_video_urls: task.results.videos.flatMap((item) => item.url ? [item.url] : []),
          seed: task.results.seed,
          inference_seconds: task.results.inference
        }
      )
    },
    {
      name: 'siliconflow_video_query',
      description:
        'Query a SiliconFlow Wan2.2 video task. When complete, download generated MP4 files into the Xpert Workspace.',
      schema: querySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

async function downloadTaskFiles(
  task: SiliconflowVideoTask,
  taskId: string,
  client: SiliconflowVideoClient,
  deps: SiliconflowVideoToolDependencies
) {
  const files: SiliconflowArtifactFile[] = []
  const safeTaskId = sanitizeFileStem(taskId)

  for (const [index, item] of task.results.videos.entries()) {
    if (!item.url) throw new Error(`SiliconFlow video result ${index + 1} is missing its URL`)

    const video = await client.downloadBuffer(item.url)
    const mimeType = video.mimeType?.startsWith('video/') ? video.mimeType : 'video/mp4'
    const suffix = task.results.videos.length > 1 ? `-${index + 1}` : ''
    const fileName = `${safeTaskId}${suffix}.${extensionFromMimeType(mimeType)}`
    files.push(await uploadGeneratedAsset({
      workspaceFiles: deps.workspaceFiles,
      workspaceScope: deps.workspaceScope,
      buffer: video.buffer,
      mimeType,
      folder: VIDEO_FOLDER,
      fileName,
      metadata: {
        source: 'siliconflow_video_generation',
        taskId,
        resultIndex: index,
        seed: task.results.seed
      }
    }))
  }

  return files
}

function createClient(deps: SiliconflowVideoToolDependencies) {
  return new SiliconflowVideoClient(deps.credentials, deps.fetch ?? fetch)
}

function isProcessing(task: SiliconflowVideoTask) {
  return task.status === 'InQueue' || task.status === 'InProgress'
}

function normalizeModel(value: unknown, hasImage: boolean): SiliconflowVideoModel {
  const model = normalizeEnum(value, SiliconflowVideoModels)
  if (model) return model
  return hasImage ? SiliconflowVideoImageModel : SiliconflowVideoTextModel
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
  const number = normalizeInteger(value)
  return number === undefined ? fallback : Math.min(Math.max(number, minimum), maximum)
}

function normalizeInteger(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isInteger(number) ? number : undefined
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
  return sanitized.slice(0, 160) || 'siliconflow-video'
}

function formatTaskError(value: unknown) {
  return typeof value === 'string' && value.trim() ? `: ${value.trim()}` : ''
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function result(
  message: string,
  files: SiliconflowArtifactFile[],
  data?: Record<string, unknown>
): SiliconflowVideoToolResult {
  return [formatResultContent(message, files), { files, ...(data ? { data } : {}) }]
}

function formatResultContent(message: string, files: SiliconflowArtifactFile[]) {
  if (!files.length) return message

  const fileLines = files.map((file, index) => {
    const url = file.fileUrl || file.url
    const title = url ? `${index + 1}. ${file.fileName}: ${url}` : `${index + 1}. ${file.fileName}`
    return `${title}\nworkspacePath: ${file.workspacePath}\nfilePath: ${file.filePath}\nmimeType: ${file.mimeType}${
      file.catalog ? `\ncatalog: ${file.catalog}` : ''
    }`
  })

  return `${message}\n\nGenerated files:\n${fileLines.join('\n')}`
}

const submitSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    prompt: {
      type: 'string',
      maxLength: 2_000,
      title: 'Prompt',
      description: 'Motion and scene description. Optional when a reference image is supplied.'
    },
    negative_prompt: {
      type: 'string',
      maxLength: 2_000,
      title: 'Negative prompt',
      description: 'Content or visual defects to avoid.'
    },
    input_image_file: {
      anyOf: [
        {
          type: 'string',
          description: 'A /workspace path, Workspace-relative path, public HTTPS URL, or image data URL.'
        },
        imageFileDescriptorSchema
      ],
      title: 'Reference image',
      description:
        'Workspace image path or descriptor. Prefer workspacePath from referenced content and pass descriptors as objects, not JSON strings.'
    },
    image_url: {
      type: 'string',
      title: 'Image URL',
      description: 'Public HTTPS image URL. Use input_image_file for Workspace images.'
    },
    model: {
      type: 'string',
      enum: SiliconflowVideoModels,
      title: 'Model',
      default: SiliconflowVideoTextModel
    },
    image_size: {
      type: 'string',
      enum: SiliconflowVideoSizes,
      title: 'Video size',
      default: '1280x720'
    },
    seed: {
      type: ['integer', 'string'],
      title: 'Seed',
      description: 'Optional deterministic seed.'
    }
  },
  // A text prompt or either supported image input is required. Keeping this
  // at the object-schema level prevents model-only calls without blocking
  // image-to-video requests that rely on the reference image.
  anyOf: [
    { required: ['prompt'] },
    { required: ['input_image_file'] },
    { required: ['image_url'] }
  ]
} as const

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    task_id: {
      type: 'string',
      title: 'Task ID',
      description: 'Task ID returned by siliconflow_video_submit.'
    },
    request_id: {
      type: 'string',
      title: 'Request ID',
      description: 'SiliconFlow requestId returned by the submit request. task_id is preferred.'
    },
    wait_seconds: {
      type: ['integer', 'string'],
      minimum: 0,
      maximum: QUERY_MAX_WAIT_SECONDS,
      default: 30,
      title: 'Bounded wait'
    },
    download_video: {
      type: ['boolean', 'string'],
      default: true,
      title: 'Download video'
    }
  },
  anyOf: [{ required: ['task_id'] }, { required: ['request_id'] }]
} as const
