import { randomUUID } from 'node:crypto'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { getToolCallIdFromConfig } from '@xpert-ai/contracts'
import { encodeMiniMaxImage } from './assets.js'
import { MINIMAX_PLUGIN_NAME, MINIMAX_VIDEO_JOB, MINIMAX_VIDEO_QUEUE } from './constants.js'
import {
  MiniMaxH3,
  MiniMaxH3Max,
  MiniMaxVideoModels,
  MiniMaxVideoRatios,
  type MiniMaxArtifactFile,
  type MiniMaxVideoContentItem,
  type MiniMaxVideoGenerationPayload,
  type MiniMaxVideoJobPayload,
  type MiniMaxVideoModel,
  type MiniMaxVideoRatio,
  type MiniMaxVideoResolution,
  type MiniMaxVideoToolDependencies,
  type MiniMaxVideoToolResult
} from './types.js'

const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 1_000

type MiniMaxToolFactory = (
  handler: (input: Record<string, unknown>, config?: unknown) => Promise<MiniMaxVideoToolResult>,
  fields: { name: string; description: string; schema: object; responseFormat: 'content_and_artifact' }
) => StructuredToolInterface

const defineMiniMaxTool = tool as unknown as MiniMaxToolFactory

export function buildMiniMaxVideoTools(deps: MiniMaxVideoToolDependencies) {
  return [buildSubmitTool(deps), buildQueryTool(deps)]
}

function buildSubmitTool(deps: MiniMaxVideoToolDependencies) {
  return defineMiniMaxTool(
    async (input, config) => {
      const prompt = requireString(input.prompt, 'Prompt is required')
      const model = normalizeModel(input.model)
      const resolution = normalizeResolution(model, input.resolution)
      const duration = normalizeDuration(model, input.duration)
      const firstFrame = input.first_frame_file
      const lastFrame = input.last_frame_file
      if (lastFrame !== undefined && firstFrame === undefined) {
        throw new Error('A final frame requires a first frame')
      }

      const content: MiniMaxVideoContentItem[] = [{ type: 'text', text: prompt }]
      if (firstFrame !== undefined) {
        content.push({
          type: 'image_url',
          image_url: { url: await encodeMiniMaxImage(firstFrame, deps, 'First frame') },
          role: 'first_frame'
        })
      }
      if (lastFrame !== undefined) {
        content.push({
          type: 'image_url',
          image_url: { url: await encodeMiniMaxImage(lastFrame, deps, 'Final frame') },
          role: 'last_frame'
        })
      }

      const payload: MiniMaxVideoGenerationPayload = {
        model,
        content,
        resolution,
        duration,
        ratio: firstFrame === undefined ? normalizeTextRatio(input.ratio) : 'adaptive',
        ...(typeof input.aigc_watermark === 'boolean' ? { aigc_watermark: input.aigc_watermark } : {})
      }
      if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 64 * 1024 * 1024) {
        throw new Error('MiniMax H3 request exceeds the 64 MB request limit')
      }
      const invocationKey = getToolCallIdFromConfig(config) ?? randomUUID()
      const taskId = `minimax-${invocationKey.replace(/[^A-Za-z0-9._-]/gu, '-')}`
      const runtimeScope = deps.runtimeScope ?? {}
      await requireManagedQueue(deps.managedQueue).enqueue({
        pluginName: MINIMAX_PLUGIN_NAME,
        queueName: MINIMAX_VIDEO_QUEUE,
        jobName: MINIMAX_VIDEO_JOB,
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
          toolName: 'minimax_h3_video_submit',
          modality: 'video',
          operation: firstFrame === undefined ? 'text_to_video' : lastFrame === undefined ? 'image_to_video' : 'first_last_frame_to_video',
          pricingDimensions: { resolution, durationSeconds: duration },
          input: payload,
          phase: 'queued',
          startedAt: new Date().toISOString(),
          runtimeScope
        }
      })
      return miniMaxVideoResult(`MiniMax H3 video generation queued. Task: ${taskId}.`, [], {
        task_id: taskId,
        request_id: invocationKey,
        status: 'queued',
        model
      })
    },
    {
      name: 'minimax_h3_video_submit',
      description: 'Submit a paid MiniMax H3 or H3 Max text-to-video or first/last-frame video task.',
      schema: submitSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildQueryTool(deps: MiniMaxVideoToolDependencies) {
  return defineMiniMaxTool(
    async (input) => {
      const taskId = requireString(input.task_id, 'Task ID is required')
      const waitSeconds = normalizeWaitSeconds(input.wait_seconds)
      const queue = requireManagedQueue(deps.managedQueue)
      let snapshot = await queue.getJob<MiniMaxVideoJobPayload>({ jobId: taskId })
      let remainingMs = waitSeconds * 1_000
      while (snapshot && !['completed', 'failed'].includes(snapshot.state || '') && remainingMs > 0) {
        const waitMs = Math.min(QUERY_POLL_MS, remainingMs)
        await (deps.sleep ?? delay)(waitMs)
        remainingMs -= waitMs
        snapshot = await queue.getJob<MiniMaxVideoJobPayload>({ jobId: taskId })
      }
      if (!snapshot) throw new Error(`MiniMax video task ${taskId} was not found`)
      if (snapshot.state === 'completed' && snapshot.data.result) return snapshot.data.result
      if (snapshot.state === 'failed') {
        throw new Error(snapshot.failedReason || snapshot.data.errorCode || `MiniMax video task ${taskId} failed`)
      }
      return miniMaxVideoResult(`MiniMax video task ${taskId} is ${snapshot.data.providerState || snapshot.data.phase}.`, [], {
        task_id: taskId,
        provider_request_id: snapshot.data.providerRequestId,
        status: snapshot.data.providerState || snapshot.data.phase
      })
    },
    {
      name: 'minimax_h3_video_query',
      description: 'Query a MiniMax H3 video task and return the completed MP4 from Workspace Files.',
      schema: querySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function normalizeModel(value: unknown): MiniMaxVideoModel {
  return typeof value === 'string' && MiniMaxVideoModels.includes(value as MiniMaxVideoModel)
    ? (value as MiniMaxVideoModel)
    : MiniMaxH3
}

function normalizeResolution(model: MiniMaxVideoModel, value: unknown): MiniMaxVideoResolution {
  const fallback = '768P'
  const resolution = typeof value === 'string' ? value.toUpperCase() : fallback
  const allowed = model === MiniMaxH3 ? ['768P', '2K'] : ['480P', '768P']
  if (!allowed.includes(resolution)) {
    throw new Error(`${model} resolution must be ${allowed.join(' or ')}`)
  }
  return resolution as MiniMaxVideoResolution
}

function normalizeDuration(model: MiniMaxVideoModel, value: unknown) {
  const duration = value === undefined ? 5 : Number(value)
  const minimum = model === MiniMaxH3Max ? 5 : 4
  if (!Number.isInteger(duration) || duration < minimum || duration > 15) {
    throw new Error(`${model} duration must be an integer from ${minimum} to 15 seconds`)
  }
  return duration
}

function normalizeTextRatio(value: unknown): MiniMaxVideoRatio {
  const ratio = typeof value === 'string' ? value : '16:9'
  if (ratio === 'adaptive' || !MiniMaxVideoRatios.includes(ratio as MiniMaxVideoRatio)) {
    throw new Error('Text-to-video ratio must be one of 21:9, 16:9, 4:3, 1:1, 3:4, or 9:16')
  }
  return ratio as MiniMaxVideoRatio
}

function normalizeWaitSeconds(value: unknown) {
  if (value === undefined) return 0
  const result = Number(value)
  if (!Number.isInteger(result) || result < 0 || result > QUERY_MAX_WAIT_SECONDS) {
    throw new Error('Wait seconds must be an integer from 0 to 45')
  }
  return result
}

function requireString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for MiniMax H3 video generation.')
  return queue
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

export function miniMaxVideoResult(
  message: string,
  files: MiniMaxArtifactFile[],
  data?: Record<string, unknown>
): MiniMaxVideoToolResult {
  const fileText = files.map((file) => `${file.fileName}: ${file.workspacePath}`).join('\n')
  return [fileText ? `${message}\n${fileText}` : message, { files, ...(data ? { data } : {}) }]
}

const fileSchema = {
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      additionalProperties: true,
      properties: {
        workspacePath: { type: 'string' },
        filePath: { type: 'string' },
        path: { type: 'string' },
        url: { type: 'string' },
        fileUrl: { type: 'string' },
        mimeType: { type: 'string' }
      }
    }
  ]
} as const

const submitSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt'],
  properties: {
    prompt: { type: 'string', minLength: 1, maxLength: 7000 },
    model: { type: 'string', enum: [...MiniMaxVideoModels], default: MiniMaxH3 },
    resolution: { type: 'string', enum: ['480P', '768P', '2K'], default: '768P' },
    duration: { type: 'integer', minimum: 4, maximum: 15, default: 5 },
    ratio: { type: 'string', enum: [...MiniMaxVideoRatios], default: '16:9' },
    first_frame_file: fileSchema,
    last_frame_file: fileSchema,
    aigc_watermark: { type: 'boolean', default: false }
  }
} as const

const querySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['task_id'],
  properties: {
    task_id: { type: 'string' },
    wait_seconds: { type: 'integer', minimum: 0, maximum: 45, default: 0 }
  }
} as const
