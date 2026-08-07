import { tool } from '@langchain/core/tools'
import { encodeKlingImage } from './assets.js'
import { KlingClient } from './client.js'
import {
  createOptions,
  createSettings,
  normalizeBoolean,
  normalizeInteger,
  normalizeVideoOptions,
  type KlingMode,
  type KlingVideoOptions
} from './rules.js'
import type { KlingProviderTask, KlingToolDependencies, KlingToolResult } from './types.js'
import { uploadGeneratedVideo } from './workspace-upload.js'

const MAX_WAIT_SECONDS = 45
const POLL_INTERVAL_MS = 5_000

export function buildKlingTools(deps: KlingToolDependencies) {
  return [
    buildTextToVideoTool(deps),
    buildImageToVideoTool(deps),
    buildFirstLastFrameTool(deps),
    buildReferenceToVideoTool(deps),
    buildQueryTool(deps)
  ]
}

function buildTextToVideoTool(deps: KlingToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<KlingToolResult> => {
      const input = asRecord(rawInput)
      const options = normalizeVideoOptions(input, 'text_to_video')
      const task = await createClient(deps).createTask(endpointFor(options, 'text_to_video'), textPayload(options))
      return submittedResult(task, options.model)
    },
    toolDefinition('kling_text_to_video', 'Submit an explicitly requested Kling text-to-video task.', textSchema)
  )
}

function buildImageToVideoTool(deps: KlingToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<KlingToolResult> => {
      const input = asRecord(rawInput)
      const options = normalizeVideoOptions(input, 'image_to_video')
      const image = await encodeKlingImage(input.input_image_file, deps, 'Input image')
      const contents = [promptContent(options.prompt), imageContent('first_frame', image.base64)]
      const task = await createClient(deps).createTask(endpointFor(options, 'image_to_video'), contentPayload(options, contents))
      return submittedResult(task, options.model)
    },
    toolDefinition('kling_image_to_video', 'Submit an explicitly requested Kling image-to-video task.', imageSchema)
  )
}

function buildFirstLastFrameTool(deps: KlingToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<KlingToolResult> => {
      const input = asRecord(rawInput)
      const options = normalizeVideoOptions(input, 'first_last_frame_to_video')
      const [first, last] = await Promise.all([
        encodeKlingImage(input.first_frame_file, deps, 'First frame'),
        encodeKlingImage(input.last_frame_file, deps, 'Last frame')
      ])
      const contents = [
        promptContent(options.prompt),
        imageContent('first_frame', first.base64),
        imageContent('last_frame', last.base64)
      ]
      const task = await createClient(deps).createTask(endpointFor(options, 'first_last_frame_to_video'), contentPayload(options, contents))
      return submittedResult(task, options.model)
    },
    toolDefinition(
      'kling_first_last_frame_to_video',
      'Submit an explicitly requested Kling first-and-last-frame video task.',
      firstLastSchema
    )
  )
}

function buildReferenceToVideoTool(deps: KlingToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<KlingToolResult> => {
      const input = asRecord(rawInput)
      const options = normalizeVideoOptions(input, 'reference_to_video')
      const files = toArray(input.reference_image_files)
      if (files.length < 1 || files.length > 7) throw new Error('Reference image count must be from 1 to 7')
      const images = await Promise.all(files.map((file, index) => encodeKlingImage(file, deps, `Reference image ${index + 1}`)))
      const contents = [
        promptContent(options.prompt),
        ...images.map((image, index) => imageContent('refer_image', image.base64, `image_${index + 1}`))
      ]
      const task = await createClient(deps).createTask('/omni-video/kling-3.0-omni', contentPayload(options, contents))
      return submittedResult(task, options.model)
    },
    toolDefinition(
      'kling_reference_to_video',
      'Submit an explicitly requested Kling 3.0 Omni task with one to seven raw reference images.',
      referenceSchema
    )
  )
}

function buildQueryTool(deps: KlingToolDependencies) {
  return tool(
    async (rawInput: unknown): Promise<KlingToolResult> => {
      const input = asRecord(rawInput)
      const taskId = requireString(input.task_id, 'Task ID is required')
      const downloadVideo = normalizeBoolean(input.download_video, true)
      const waitSeconds = normalizeInteger(input.wait_seconds, MAX_WAIT_SECONDS)
      if (waitSeconds < 0 || waitSeconds > MAX_WAIT_SECONDS) throw new Error('Wait time must be from 0 to 45 seconds')
      const client = createClient(deps)
      const deadline = Date.now() + waitSeconds * 1000
      let task = await client.queryTask(taskId)
      while (isActive(task) && Date.now() < deadline) {
        await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())))
        task = await client.queryTask(taskId)
      }

      if (task.status !== 'succeeded' || !downloadVideo) return taskResult(task)
      const output = task.outputs[0]
      if (!output) throw new Error('Kling task succeeded without an MP4 result')
      const downloaded = await client.downloadBuffer(output.url)
      const file = await uploadGeneratedVideo(deps, task.id, downloaded.buffer, downloaded.mimeType)
      return taskResult(task, [file])
    },
    toolDefinition('kling_video_query', 'Query a Kling video task and optionally archive a completed MP4 to Workspace Files.', querySchema)
  )
}

function endpointFor(options: KlingVideoOptions, mode: KlingMode) {
  if (options.model === 'kling-v3-omni') return '/omni-video/kling-3.0-omni'
  if (options.model === 'kling-3.0-turbo') {
    return mode === 'text_to_video' ? '/text-to-video/kling-3.0-turbo' : '/image-to-video/kling-3.0-turbo'
  }
  return mode === 'text_to_video' ? '/text-to-video/kling-3.0' : '/image-to-video/kling-3.0'
}

function textPayload(options: KlingVideoOptions) {
  if (options.model === 'kling-v3-omni') return contentPayload(options, [promptContent(options.prompt)])
  return {
    prompt: options.prompt,
    settings: createSettings(options, true),
    options: createOptions(options)
  }
}

function contentPayload(options: KlingVideoOptions, contents: Record<string, unknown>[]) {
  const hasFrame = contents.some((item) => item.type === 'first_frame')
  return {
    contents,
    settings: createSettings(options, !hasFrame),
    options: createOptions(options)
  }
}

function promptContent(text: string) {
  return { type: 'prompt', text }
}

function imageContent(type: 'first_frame' | 'last_frame' | 'refer_image', url: string, id?: string) {
  return { type, url, ...(id ? { id } : {}) }
}

function submittedResult(task: KlingProviderTask, model: string): KlingToolResult {
  return [
    `Kling video task submitted. Task ID: ${task.id}. Status: ${task.status}.`,
    { files: [], data: { task_id: task.id, status: task.status, model } }
  ]
}

function taskResult(task: KlingProviderTask, files: KlingToolResult[1]['files'] = []): KlingToolResult {
  const content = [
    `Kling video task ${task.id} is ${task.status}.`,
    ...files.map((file) => `Workspace video: ${file.workspacePath}`),
    task.error ? `Error: ${task.error}` : ''
  ].filter(Boolean).join('\n')
  return [
    content,
    {
      files,
      data: {
        task_id: task.id,
        status: task.status,
        ...(task.model ? { model: task.model } : {}),
        ...(task.error ? { error: task.error } : {}),
        ...(task.createdAt ? { created_at: task.createdAt } : {}),
        ...(task.updatedAt ? { updated_at: task.updatedAt } : {})
      }
    }
  ]
}

function createClient(deps: KlingToolDependencies) {
  return new KlingClient(deps.credentials, deps.fetch)
}

function isActive(task: KlingProviderTask) {
  return task.status === 'submitted' || task.status === 'processing'
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function requireString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(message)
  return value.trim()
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : [value]
    } catch {
      return [value]
    }
  }
  return value === undefined || value === null ? [] : [value]
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool input must be an object')
  return value as Record<string, unknown>
}

function toolDefinition(name: string, description: string, schema: Record<string, unknown>) {
  return { name, description, schema, responseFormat: 'content_and_artifact' as const }
}

const localizedBoolean = {
  type: 'string',
  enum: ['true', 'false'],
  default: 'false',
  'x-ui': {
    component: 'select',
    enumLabels: {
      true: { en_US: 'Enabled', zh_Hans: '开启' },
      false: { en_US: 'Disabled', zh_Hans: '关闭' }
    }
  }
}

const commonProperties = {
  prompt: {
    type: 'string', minLength: 1, maxLength: 3072,
    'x-ui': { title: { en_US: 'Prompt', zh_Hans: '创作要求' }, component: 'textarea' }
  },
  model: {
    type: 'string', enum: ['kling-v3', 'kling-v3-omni', 'kling-3.0-turbo'], default: 'kling-v3',
    'x-ui': { title: { en_US: 'Model', zh_Hans: '生成模型' }, component: 'select' }
  },
  resolution: {
    type: 'string', enum: ['720p', '1080p', '4k'], default: '720p',
    'x-ui': { title: { en_US: 'Resolution', zh_Hans: '清晰度' }, component: 'select' }
  },
  ratio: {
    type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9',
    'x-ui': { title: { en_US: 'Aspect ratio', zh_Hans: '画面形状' }, component: 'select' }
  },
  duration: {
    type: 'integer', minimum: 3, maximum: 15, default: 5,
    'x-ui': { title: { en_US: 'Duration', zh_Hans: '时长' } }
  },
  generate_audio: {
    ...localizedBoolean,
    'x-ui': { ...localizedBoolean['x-ui'], title: { en_US: 'Native audio', zh_Hans: '原生声音' } }
  },
  multi_shot: {
    ...localizedBoolean,
    'x-ui': { ...localizedBoolean['x-ui'], title: { en_US: 'Multiple shots', zh_Hans: '多镜头叙事' } }
  },
  watermark: {
    ...localizedBoolean,
    'x-ui': { ...localizedBoolean['x-ui'], title: { en_US: 'Watermarked copy', zh_Hans: '水印副本' } }
  }
}

const textSchema = objectSchema(commonProperties, ['prompt'])
const imageSchema = objectSchema({
  ...commonProperties,
  input_image_file: fileProperty('Input image', '起始画面')
}, ['prompt', 'input_image_file'])
const firstLastSchema = objectSchema({
  ...commonProperties,
  first_frame_file: fileProperty('First frame', '起始画面'),
  last_frame_file: fileProperty('Last frame', '结束画面')
}, ['prompt', 'first_frame_file', 'last_frame_file'])
const referenceSchema = objectSchema({
  ...commonProperties,
  model: { ...commonProperties.model, enum: ['kling-v3-omni'], default: 'kling-v3-omni' },
  reference_image_files: {
    type: 'array', minItems: 1, maxItems: 7, items: { type: 'object' },
    'x-ui': { title: { en_US: 'Reference images', zh_Hans: '参考图片' }, component: 'file-list' }
  }
}, ['prompt', 'reference_image_files'])
const querySchema = objectSchema({
  task_id: {
    type: 'string', minLength: 1,
    'x-ui': { title: { en_US: 'Task ID', zh_Hans: '生成任务编号' } }
  },
  download_video: {
    ...localizedBoolean, default: 'true',
    'x-ui': { ...localizedBoolean['x-ui'], title: { en_US: 'Save completed video', zh_Hans: '保存完成的视频' } }
  },
  wait_seconds: {
    type: 'integer', minimum: 0, maximum: 45, default: 45,
    'x-ui': { title: { en_US: 'Bounded wait', zh_Hans: '本次等待时长' } }
  }
}, ['task_id'])

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return { type: 'object', additionalProperties: false, properties, required }
}

function fileProperty(en_US: string, zh_Hans: string) {
  return {
    type: 'object',
    'x-ui': { title: { en_US, zh_Hans }, component: 'file' }
  }
}
