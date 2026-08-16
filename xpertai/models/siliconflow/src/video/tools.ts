import { randomUUID } from 'node:crypto'
import { tool } from '@langchain/core/tools'
import { getToolCallIdFromConfig } from '@xpert-ai/contracts'
import { encodeImageInput } from './assets.js'
import type {
  SiliconflowArtifactFile,
  SiliconflowVideoGenerationPayload,
  SiliconflowVideoJobPayload,
  SiliconflowVideoModel,
  SiliconflowVideoToolDependencies,
  SiliconflowVideoToolResult
} from './types.js'
import {
  SiliconflowVideoImageModel,
  SiliconflowVideoModels,
  SiliconflowVideoSizes,
  SiliconflowVideoTextModel
} from './types.js'
import { SILICONFLOW_PLUGIN_NAME, SILICONFLOW_VIDEO_JOB, SILICONFLOW_VIDEO_QUEUE } from './constants.js'

const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 1_000

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
    async (input: unknown, config): Promise<SiliconflowVideoToolResult> => {
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

      const invocationKey = getToolCallIdFromConfig(config) ?? randomUUID()
      const taskId = queueJobId(invocationKey)
      const managedQueue = requireManagedQueue(deps.managedQueue)
      const runtimeScope = deps.runtimeScope ?? {}
      await managedQueue.enqueue({
        pluginName: SILICONFLOW_PLUGIN_NAME,
        queueName: SILICONFLOW_VIDEO_QUEUE,
        jobName: SILICONFLOW_VIDEO_JOB,
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
          toolName: 'siliconflow_video_submit',
          modality: 'video',
        operation: imageInput === undefined ? 'text_to_video' : 'image_to_video',
          pricingDimensions: payload.image_size ? { resolution: payload.image_size } : undefined,
          input: payload,
          phase: 'queued',
          startedAt: new Date().toISOString(),
          runtimeScope
        }
      })

      const message = [
        'SiliconFlow video generation task queued.',
        `Task ID: ${taskId}`,
        'Call siliconflow_video_query with this task_id to check completion and download the generated video.',
        'The Managed Queue job submits and polls the provider task without occupying the conversation request.'
      ].join('\n')

      return siliconflowVideoResult(message, [], {
        task_id: taskId,
        request_id: invocationKey,
        status: 'queued',
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
      const waitSeconds = clampInteger(values.wait_seconds, 30, 0, QUERY_MAX_WAIT_SECONDS)
      const sleep = deps.sleep ?? delay
      const managedQueue = requireManagedQueue(deps.managedQueue)

      let snapshot = await managedQueue.getJob<SiliconflowVideoJobPayload>({ jobId: taskId })
      let remainingMs = waitSeconds * 1_000
      while (snapshot && !isTerminalQueueState(snapshot.state) && remainingMs > 0) {
        const delayMs = Math.min(QUERY_POLL_MS, remainingMs)
        await sleep(delayMs)
        remainingMs -= delayMs
        snapshot = await managedQueue.getJob<SiliconflowVideoJobPayload>({ jobId: taskId })
      }

      if (!snapshot) throw new Error(`SiliconFlow video generation task ${taskId} was not found`)
      if (snapshot.state === 'completed' && snapshot.data.result) return snapshot.data.result
      if (snapshot.state === 'failed') {
        throw new Error(snapshot.failedReason || snapshot.data.errorCode || `SiliconFlow video task ${taskId} failed`)
      }
      return siliconflowVideoResult(
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
      name: 'siliconflow_video_query',
      description:
        'Query a SiliconFlow Wan2.2 video task. When complete, download generated MP4 files into the Xpert Workspace.',
      schema: querySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function normalizeModel(value: unknown, hasImage: boolean): SiliconflowVideoModel {
  const model = normalizeEnum(value, SiliconflowVideoModels)
  if (model) return model
  return hasImage ? SiliconflowVideoImageModel : SiliconflowVideoTextModel
}

function normalizeEnum<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && options.includes(value as T) ? (value as T) : undefined
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

export function siliconflowVideoResult(
  message: string,
  files: SiliconflowArtifactFile[],
  data?: Record<string, unknown>
): SiliconflowVideoToolResult {
  return [formatResultContent(message, files), { files, ...(data ? { data } : {}) }]
}

function queueJobId(requestId: string) {
  return `siliconflow-${requestId.replace(/[^a-zA-Z0-9._-]/g, '-')}`
}

function isTerminalQueueState(state?: string) {
  return state === 'completed' || state === 'failed'
}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for SiliconFlow video generation.')
  return queue
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
  anyOf: [{ required: ['prompt'] }, { required: ['input_image_file'] }, { required: ['image_url'] }]
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
    model: {
      type: 'string',
      enum: SiliconflowVideoModels,
      title: 'Model',
      default: SiliconflowVideoTextModel
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
