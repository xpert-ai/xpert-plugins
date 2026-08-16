import { randomUUID } from 'node:crypto'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { getToolCallIdFromConfig } from '@xpert-ai/contracts'
import { encodeInlineImage } from './assets.js'
import { VEO_PLUGIN_NAME, VEO_VIDEO_JOB, VEO_VIDEO_QUEUE } from './constants.js'
import {
  assertInlineRequestLimit,
  normalizeBoolean,
  normalizeSubmissionOptions,
  requireReferenceImages,
  requireString,
  type VeoGenerationMode,
  type VeoSubmissionOptions
} from './rules.js'
import {
  firstLastFrameToVideoSchema,
  imageToVideoSchema,
  referenceToVideoSchema,
  textToVideoSchema,
  videoQuerySchema
} from './schemas.js'
import type {
  VeoArtifactFile,
  VeoInlineImage,
  VeoToolDependencies,
  VeoToolResult,
  VeoVideoJobPayload
} from './types.js'

const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 1_000

type VeoToolFactory = (
  handler: (input: Record<string, unknown>, config?: unknown) => Promise<VeoToolResult>,
  fields: {
    name: string
    description: string
    schema: object
    responseFormat: 'content_and_artifact'
  }
) => StructuredToolInterface

// LangChain accepts JSON Schema, while current plugin-sdk declarations retain a Zod-only generic.
const defineVeoTool = tool as unknown as VeoToolFactory

type VeoInstance = {
  prompt: string
  image?: VeoInlineImage
  lastFrame?: VeoInlineImage
  referenceImages?: Array<{
    image: VeoInlineImage
    referenceType: 'asset'
  }>
}

export function buildVeoTools(deps: VeoToolDependencies) {
  return [
    buildTextToVideoTool(deps),
    buildImageToVideoTool(deps),
    buildFirstLastFrameToVideoTool(deps),
    buildReferenceToVideoTool(deps),
    buildVideoQueryTool(deps)
  ]
}

function buildTextToVideoTool(deps: VeoToolDependencies) {
  return defineVeoTool(
    async (input: Record<string, unknown>, config?: unknown): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, config, 'text_to_video', async (options) => ({
        prompt: options.prompt
      }))
    },
    {
      name: 'veo_text_to_video',
      description:
        'Submit one paid Google Veo text-to-video task after validating the request. Call only when the user explicitly requests generation.',
      schema: textToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildImageToVideoTool(deps: VeoToolDependencies) {
  return defineVeoTool(
    async (input: Record<string, unknown>, config?: unknown): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, config, 'image_to_video', async (options) => ({
        prompt: options.prompt,
        image: await encodeInlineImage(input.input_image_file, deps, 'Initial image')
      }))
    },
    {
      name: 'veo_image_to_video',
      description:
        'Submit one paid Google Veo video task using a Workspace image as the initial frame. Call only when the user explicitly requests generation.',
      schema: imageToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildFirstLastFrameToVideoTool(deps: VeoToolDependencies) {
  return defineVeoTool(
    async (input: Record<string, unknown>, config?: unknown): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, config, 'first_last_frame_to_video', async (options) => ({
        prompt: options.prompt,
        image: await encodeInlineImage(input.first_frame_file, deps, 'First frame'),
        lastFrame: await encodeInlineImage(input.last_frame_file, deps, 'Final frame')
      }))
    },
    {
      name: 'veo_first_last_frame_to_video',
      description:
        'Submit one paid Google Veo interpolation task from first and final Workspace images. Call only when the user explicitly requests generation.',
      schema: firstLastFrameToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildReferenceToVideoTool(deps: VeoToolDependencies) {
  return defineVeoTool(
    async (input: Record<string, unknown>, config?: unknown): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, config, 'reference_to_video', async (options) => {
        const references = requireReferenceImages(input.reference_image_files)
        const images = await Promise.all(
          references.map((reference, index) => encodeInlineImage(reference, deps, `Asset reference image ${index + 1}`))
        )
        return {
          prompt: options.prompt,
          referenceImages: images.map((image) => ({
            image,
            referenceType: 'asset' as const
          }))
        }
      })
    },
    {
      name: 'veo_reference_to_video',
      description:
        'Submit one paid Google Veo 8-second task guided by one to three asset reference images. Call only when the user explicitly requests generation.',
      schema: referenceToVideoSchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

function buildVideoQueryTool(deps: VeoToolDependencies) {
  return defineVeoTool(
    async (input: Record<string, unknown>): Promise<VeoToolResult> => {
      const taskId = requireString(input.task_id, 'Generation task is required')
      const waitSeconds = normalizeWaitSeconds(input.wait_seconds)
      const managedQueue = requireManagedQueue(deps.managedQueue)
      let snapshot = await managedQueue.getJob<VeoVideoJobPayload>({ jobId: taskId })
      const deadline = Date.now() + waitSeconds * 1_000
      while (snapshot && !isTerminalQueueState(snapshot.state) && Date.now() < deadline) {
        await (deps.sleep ?? delay)(Math.min(QUERY_POLL_MS, Math.max(0, deadline - Date.now())))
        snapshot = await managedQueue.getJob<VeoVideoJobPayload>({ jobId: taskId })
      }

      if (!snapshot) throw new Error(`Veo generation task ${taskId} was not found`)
      if (snapshot.state === 'completed' && snapshot.data.result) return snapshot.data.result
      if (snapshot.state === 'failed') {
        throw new Error(snapshot.failedReason || snapshot.data.errorCode || `Veo generation task ${taskId} failed`)
      }
      return veoResult(`Veo generation ${taskId} is ${snapshot.data.providerState || snapshot.data.phase}.`, [], {
        task_id: taskId,
        request_id: snapshot.data.requestId,
        provider_request_id: snapshot.data.providerRequestId,
        status: snapshot.data.providerState || snapshot.data.phase
      })
    },
    {
      name: 'veo_video_query',
      description: 'Query a Veo generation task and optionally save a completed MP4 to Workspace Files.',
      schema: videoQuerySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

async function submitGeneration(
  deps: VeoToolDependencies,
  input: Record<string, unknown>,
  config: unknown,
  mode: VeoGenerationMode,
  createInstance: (options: VeoSubmissionOptions) => Promise<VeoInstance>
): Promise<VeoToolResult> {
  const options = normalizeSubmissionOptions(input, mode)
  const instance = await createInstance(options)
  const payload = {
    instances: [instance],
    parameters: {
      aspectRatio: options.aspectRatio,
      durationSeconds: String(options.durationSeconds),
      resolution: options.resolution,
      personGeneration: options.personGeneration
    }
  }
  assertInlineRequestLimit(payload)
  const invocationKey = getToolCallIdFromConfig(config) ?? randomUUID()
  const toolName = veoSubmitToolName(mode)
  const taskId = queueJobId(invocationKey)
  const runtimeScope = deps.runtimeScope ?? {}
  await requireManagedQueue(deps.managedQueue).enqueue({
    pluginName: VEO_PLUGIN_NAME,
    queueName: VEO_VIDEO_QUEUE,
    jobName: VEO_VIDEO_JOB,
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
      operation: mode,
      pricingDimensions: {
        durationSeconds: options.durationSeconds,
        resolution: options.resolution,
        audio: true,
        mode
      },
      input: { model: options.model, payload },
      phase: 'queued',
      startedAt: new Date().toISOString(),
      runtimeScope
    }
  })
  return veoResult(`Veo generation queued. Task: ${taskId}.`, [], {
    task_id: taskId,
    status: 'queued',
    model: options.model
  })
}

function veoSubmitToolName(mode: VeoGenerationMode) {
  return mode === 'first_last_frame_to_video' ? 'veo_first_last_frame_to_video' : `veo_${mode}`
}

function normalizeWaitSeconds(value: unknown) {
  if (value === undefined) return 0
  const waitSeconds = Number(value)
  if (!Number.isInteger(waitSeconds) || waitSeconds < 0 || waitSeconds > QUERY_MAX_WAIT_SECONDS) {
    throw new Error('Bounded wait must be an integer from 0 to 45 seconds')
  }
  return waitSeconds
}

export function veoResult(message: string, files: VeoArtifactFile[], data?: Record<string, unknown>): VeoToolResult {
  return [message, { files, ...(data ? { data } : {}) }]
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function queueJobId(requestId: string) {
  return `veo-${requestId.replace(/[^a-zA-Z0-9._-]/g, '-')}`
}

function isTerminalQueueState(state?: string) {
  return state === 'completed' || state === 'failed'
}

function requireManagedQueue<T>(queue: T | undefined): T {
  if (!queue) throw new Error('Managed Queue is required for Google Veo generation.')
  return queue
}
