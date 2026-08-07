import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { encodeInlineImage } from './assets.js'
import { GeminiVeoClient, validateVeoOperationName } from './client.js'
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
  VeoOperation,
  VeoOperationError,
  VeoToolDependencies,
  VeoToolResult
} from './types.js'
import { uploadGeneratedVideo } from './workspace-upload.js'

const QUERY_MAX_WAIT_SECONDS = 45
const QUERY_POLL_MS = 5_000

type VeoToolFactory = (
  handler: (input: Record<string, unknown>) => Promise<VeoToolResult>,
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
    async (input: Record<string, unknown>): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, 'text_to_video', async (options) => ({
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
    async (input: Record<string, unknown>): Promise<VeoToolResult> => {
      return submitGeneration(deps, input, 'image_to_video', async (options) => ({
        prompt: options.prompt,
        image: await encodeInlineImage(
          input.input_image_file,
          deps,
          'Initial image'
        )
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
    async (input: Record<string, unknown>): Promise<VeoToolResult> => {
      return submitGeneration(
        deps,
        input,
        'first_last_frame_to_video',
        async (options) => ({
          prompt: options.prompt,
          image: await encodeInlineImage(
            input.first_frame_file,
            deps,
            'First frame'
          ),
          lastFrame: await encodeInlineImage(
            input.last_frame_file,
            deps,
            'Final frame'
          )
        })
      )
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
    async (input: Record<string, unknown>): Promise<VeoToolResult> => {
      return submitGeneration(
        deps,
        input,
        'reference_to_video',
        async (options) => {
          const references = requireReferenceImages(input.reference_image_files)
          const images = await Promise.all(
            references.map((reference, index) =>
              encodeInlineImage(reference, deps, `Asset reference image ${index + 1}`)
            )
          )
          return {
            prompt: options.prompt,
            referenceImages: images.map((image) => ({
              image,
              referenceType: 'asset' as const
            }))
          }
        }
      )
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
      const taskId = validateVeoOperationName(
        requireString(input.task_id, 'Generation task is required')
      )
      const downloadVideo =
        input.download_video === undefined
          ? true
          : normalizeBoolean(input.download_video)
      const waitSeconds = normalizeWaitSeconds(input.wait_seconds)
      const client = new GeminiVeoClient(deps.credentials, deps.fetch ?? fetch)
      let operation = await client.getOperation(taskId)
      const deadline = Date.now() + waitSeconds * 1_000
      while (!operation.done && Date.now() < deadline) {
        await delay(
          Math.min(QUERY_POLL_MS, Math.max(0, deadline - Date.now()))
        )
        operation = await client.getOperation(taskId)
      }

      const resolvedTaskId = operation.name
        ? validateVeoOperationName(operation.name)
        : taskId
      if (!operation.done) {
        return result(
          `Veo generation ${resolvedTaskId} is still running.`,
          [],
          {
            task_id: resolvedTaskId,
            status: 'running'
          }
        )
      }

      if (operation.error) {
        const error = normalizeOperationError(operation.error)
        return result(`Veo generation ${resolvedTaskId} failed.`, [], {
          task_id: resolvedTaskId,
          status: 'failed',
          error
        })
      }

      const videoUri = readGeneratedVideoUri(operation)
      if (!videoUri) {
        return result(`Veo generation ${resolvedTaskId} produced no video.`, [], {
          task_id: resolvedTaskId,
          status: 'failed',
          error: {
            code: 'VEO_NO_VIDEO_OUTPUT',
            message: readFilteredOutputMessage(operation)
          }
        })
      }

      const files: VeoArtifactFile[] = []
      if (downloadVideo) {
        const downloaded = await client.downloadVideo(videoUri)
        files.push(
          await uploadGeneratedVideo({
            workspaceFiles: deps.workspaceFiles,
            workspaceScope: deps.workspaceScope,
            buffer: downloaded.buffer,
            fileName: `${safeTaskFileStem(resolvedTaskId)}.mp4`,
            mimeType: downloaded.mimeType.startsWith('video/')
              ? downloaded.mimeType
              : 'video/mp4',
            taskId: resolvedTaskId
          })
        )
      }
      return result(`Veo generation ${resolvedTaskId} completed.`, files, {
        task_id: resolvedTaskId,
        status: 'succeeded'
      })
    },
    {
      name: 'veo_video_query',
      description:
        'Query a Veo generation task and optionally save a completed MP4 to Workspace Files.',
      schema: videoQuerySchema,
      responseFormat: 'content_and_artifact'
    }
  )
}

async function submitGeneration(
  deps: VeoToolDependencies,
  input: Record<string, unknown>,
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
  const client = new GeminiVeoClient(deps.credentials, deps.fetch ?? fetch)
  const operation = await client.submit(options.model, payload)
  const taskId = validateVeoOperationName(
    requireString(operation.name, 'Gemini Veo response did not include an operation name')
  )
  return result(`Veo generation submitted. Task: ${taskId}.`, [], {
    task_id: taskId,
    status: 'submitted',
    model: options.model
  })
}

function normalizeWaitSeconds(value: unknown) {
  if (value === undefined) return 0
  const waitSeconds = Number(value)
  if (
    !Number.isInteger(waitSeconds) ||
    waitSeconds < 0 ||
    waitSeconds > QUERY_MAX_WAIT_SECONDS
  ) {
    throw new Error('Bounded wait must be an integer from 0 to 45 seconds')
  }
  return waitSeconds
}

function readGeneratedVideoUri(operation: VeoOperation) {
  const uri =
    operation.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
  return typeof uri === 'string' && uri.trim() ? uri.trim() : undefined
}

function readFilteredOutputMessage(operation: VeoOperation) {
  const count =
    operation.response?.generateVideoResponse?.raiMediaFilteredCount ?? 0
  return count > 0
    ? 'The provider safety filters did not return a video.'
    : 'The completed provider operation did not contain a generated video.'
}

function normalizeOperationError(error: VeoOperationError) {
  const code =
    typeof error.status === 'string' && error.status.trim()
      ? error.status.trim()
      : error.code !== undefined
        ? String(error.code)
        : 'VEO_GENERATION_FAILED'
  const message =
    typeof error.message === 'string' && error.message.trim()
      ? error.message
          .replace(/https?:\/\/\S+/gi, '[redacted-url]')
          .replace(/[\r\n]+/g, ' ')
          .slice(0, 500)
      : 'The Veo generation operation failed.'
  return { code, message }
}

function safeTaskFileStem(taskId: string) {
  const lastSegment = taskId.split('/').filter(Boolean).pop() || 'veo-video'
  return lastSegment.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180)
}

function result(
  message: string,
  files: VeoArtifactFile[],
  data?: Record<string, unknown>
): VeoToolResult {
  return [message, { files, ...(data ? { data } : {}) }]
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}
