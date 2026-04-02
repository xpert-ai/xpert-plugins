import { Buffer } from 'node:buffer'
import { posix as path } from 'node:path'
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  isAIMessage,
  isToolMessage
} from '@langchain/core/messages'
import { RunnableConfig } from '@langchain/core/runnables'
import { tool, type DynamicStructuredTool } from '@langchain/core/tools'
import { getToolCallIdFromConfig, type TAgentRunnableConfigurable } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { BaseSandbox, type ModelRequest } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  DEFAULT_SANDBOX_ROOT,
  DEFAULT_VIEW_IMAGE_CACHE_TTL_MS,
  DEFAULT_VIEW_IMAGE_MAX_EDGE,
  DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES,
  DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL,
  VIEW_IMAGE_ALLOWED_MIME_TYPES,
  VIEW_IMAGE_METADATA_KEY,
  VIEW_IMAGE_TOOL_NAME,
  type ViewImagePluginConfig,
  type ViewedImageBatch,
  type ViewedImageBatchMetadata,
  type ViewedImageItem,
  ViewImagePluginConfigSchema,
  ViewedImageBatchMetadataSchema,
  ViewImageToolInputSchema
} from './view-image.types.js'

type ViewImageSandbox = Pick<BaseSandbox, 'downloadFiles' | 'workingDirectory'>

type PreparedImage = {
  buffer: Buffer
  width?: number
  height?: number
}

type ResolvedImageTarget = {
  target: string
  resolvedPath: string
  downloadPath: string
  fileName: string
}

type CachedViewedImageBatch = ViewedImageBatch & {
  expiresAt: number
}

type PreparedModelRequest<TState extends Record<string, unknown>> = {
  request: ModelRequest<TState>
  cleanupKeys: string[]
}

type ReadyToolCallSet = {
  toolCalls: NonNullable<AIMessage['tool_calls']>
  toolMessagesById: Map<string, ToolMessage>
}

@Injectable()
export class ViewImageService {
  private readonly pendingViewedImageBatches = new Map<string, CachedViewedImageBatch>()

  resolveConfig(config?: Partial<ViewImagePluginConfig>): ViewImagePluginConfig {
    return ViewImagePluginConfigSchema.parse(config ?? {})
  }

  buildSystemPrompt(): string {
    return [
      '<skill>',
      'When the user asks about an image file in the sandbox workspace, call `view_image` before reasoning about the image contents.',
      'Pass multiple image paths in one `view_image` call when you already know all files you need.',
      'You may also call `view_image` multiple times in the same step when discovery is incremental.',
      'Prefer relative paths from the sandbox working directory. Absolute paths are only supported when they still point to files inside that same working directory.',
      'Do not guess what an image contains unless it has been loaded with `view_image`.',
      '</skill>'
    ].join('\n')
  }

  createTool(): DynamicStructuredTool {
    return tool(
      async (input, runConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        if (!backend) {
          throw new Error('Sandbox backend is not available for `view_image`.')
        }

        this.pruneExpiredBatches()

        const toolCallId = getToolCallIdFromConfig(runConfig) ?? VIEW_IMAGE_TOOL_NAME
        const workingDirectory = this.resolveVisibleWorkingDirectory(runConfig?.configurable, backend)
        const targets = normalizeTargets(input.path)
        const items = await this.loadViewedImageItems(backend, targets, workingDirectory)
        const batch: ViewedImageBatch = {
          toolCallId,
          createdAt: new Date().toISOString(),
          items
        }

        this.pendingViewedImageBatches.set(this.buildPendingBatchKey(runConfig?.configurable, toolCallId), {
          ...batch,
          expiresAt: Date.now() + DEFAULT_VIEW_IMAGE_CACHE_TTL_MS
        })

        return new ToolMessage({
          content: buildToolSuccessMessage(items),
          name: VIEW_IMAGE_TOOL_NAME,
          tool_call_id: toolCallId,
          status: 'success',
          metadata: {
            [VIEW_IMAGE_METADATA_KEY]: toViewedImageBatchMetadata(batch)
          }
        })
      },
      {
        name: VIEW_IMAGE_TOOL_NAME,
        description:
          'Load one or more image files from the sandbox workspace so the next model step can inspect them. Use this before answering questions about image files by path.',
        schema: ViewImageToolInputSchema
      }
    )
  }

  async prepareModelRequest<TState extends Record<string, unknown>>(
    request: ModelRequest<TState>,
    backend: ViewImageSandbox
  ): Promise<PreparedModelRequest<TState>> {
    this.pruneExpiredBatches()

    const prompt = this.buildSystemPrompt()
    const baseContent = toSystemMessageText(request.systemMessage?.content)
    const nextRequest: ModelRequest<TState> = {
      ...request,
      systemMessage: new SystemMessage({
        content: [baseContent, prompt].filter(Boolean).join('\n\n')
      })
    }

    const readyToolCallSet = findReadyToolCallSet(request.messages)
    if (!readyToolCallSet) {
      return { request: nextRequest, cleanupKeys: [] }
    }

    const viewImageToolCalls = readyToolCallSet.toolCalls.filter(
      (toolCall) => toolCall.name === VIEW_IMAGE_TOOL_NAME && !!toolCall.id
    )
    if (viewImageToolCalls.length === 0) {
      return { request: nextRequest, cleanupKeys: [] }
    }

    const cleanupKeys = viewImageToolCalls.map((toolCall) =>
      this.buildPendingBatchKey(request.runtime?.configurable, toolCall.id as string)
    )

    const workingDirectory = this.resolveVisibleWorkingDirectory(request.runtime?.configurable, backend)
    const batches = await Promise.all(
      viewImageToolCalls.map((toolCall) =>
        this.resolveViewedImageBatch(
          toolCall.id as string,
          readyToolCallSet.toolMessagesById.get(toolCall.id as string) ?? null,
          request.runtime?.configurable,
          backend,
          workingDirectory
        )
      )
    )

    if (batches.some((batch) => !batch)) {
      return { request: nextRequest, cleanupKeys: [] }
    }

    const items = batches.flatMap((batch) => (batch as ViewedImageBatch).items)
    if (items.length === 0) {
      return { request: nextRequest, cleanupKeys }
    }

    if (items.length > DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL) {
      throw new Error(
        `The current model step has ${items.length} images loaded via \`${VIEW_IMAGE_TOOL_NAME}\`, exceeding the limit of ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per step.`
      )
    }

    const attachmentMessage = new HumanMessage({
      content: [
        {
          type: 'text',
          text: buildImageAttachmentText(items)
        },
        ...items.map((item) => ({
          type: 'image_url',
          image_url: {
            url: item.dataUrl,
            detail: 'low'
          }
        }))
      ]
    })

    return {
      request: {
        ...nextRequest,
        messages: [...request.messages, attachmentMessage]
      },
      cleanupKeys
    }
  }

  finalizePreparedBatches(cleanupKeys: string[]) {
    cleanupKeys.forEach((key) => this.pendingViewedImageBatches.delete(key))
  }

  async loadViewedImageItems(
    backend: ViewImageSandbox,
    targets: string[],
    workingDirectory: string
  ): Promise<ViewedImageItem[]> {
    const resolvedTargets = targets.map((target) => resolveImageTarget(target, workingDirectory))
    return this.loadViewedImageItemsFromTargets(backend, resolvedTargets)
  }

  resolveVisibleWorkingDirectory(
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    backend: ViewImageSandbox
  ): string {
    const configured = normalizeWorkingDirectory(getSandboxWorkingDirectory(configurable))
    if (configured) {
      return configured
    }

    const backendWorkingDirectory = normalizeWorkingDirectory(backend.workingDirectory)
    if (backendWorkingDirectory) {
      return backendWorkingDirectory
    }

    return DEFAULT_SANDBOX_ROOT
  }

  private async resolveViewedImageBatch(
    toolCallId: string,
    toolMessage: ToolMessage | null,
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    backend: ViewImageSandbox,
    workingDirectory: string
  ): Promise<ViewedImageBatch | null> {
    const cacheKey = this.buildPendingBatchKey(configurable, toolCallId)
    const cachedBatch = this.pendingViewedImageBatches.get(cacheKey)

    if (cachedBatch && cachedBatch.expiresAt > Date.now()) {
      return {
        toolCallId: cachedBatch.toolCallId,
        createdAt: cachedBatch.createdAt,
        items: cachedBatch.items
      }
    }

    if (cachedBatch) {
      this.pendingViewedImageBatches.delete(cacheKey)
    }

    const metadata = getViewedImageBatchMetadata(toolMessage)
    if (!metadata || metadata.toolCallId !== toolCallId) {
      return null
    }

    return {
      toolCallId,
      createdAt: metadata.createdAt,
      items: await this.loadViewedImageItemsFromTargets(
        backend,
        metadata.items.map((item) => resolveStoredImageTarget(item, workingDirectory))
      )
    }
  }

  private async loadViewedImageItemsFromTargets(backend: ViewImageSandbox, targets: ResolvedImageTarget[]): Promise<ViewedImageItem[]> {
    const downloads = await backend.downloadFiles(targets.map(({ downloadPath }) => downloadPath))
    if (!Array.isArray(downloads) || downloads.length !== targets.length) {
      throw new Error('Sandbox backend returned an unexpected response for `view_image`.')
    }

    const items: ViewedImageItem[] = []

    for (let index = 0; index < downloads.length; index += 1) {
      const download = downloads[index]
      const targetInfo = targets[index]
      if (!download || !targetInfo) {
        throw new Error('Sandbox backend returned mismatched file results for `view_image`.')
      }

      if (download.error) {
        throw new Error(buildDownloadErrorMessage(targetInfo.target, download.error))
      }

      if (!download.content) {
        throw new Error(`Unable to read image at "${targetInfo.target}".`)
      }

      const originalBuffer = Buffer.from(download.content)
      if (originalBuffer.byteLength > DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES) {
        throw new Error(
          `Image "${targetInfo.target}" is too large (${originalBuffer.byteLength} bytes). Maximum size is ${DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES} bytes.`
        )
      }

      const mimeType = detectImageMimeType(originalBuffer)
      if (!mimeType) {
        throw new Error(
          `Path "${targetInfo.target}" is not a supported image. Only PNG, JPEG, and WEBP files are allowed.`
        )
      }

      const prepared = await prepareImageForModel(originalBuffer)
      items.push({
        target: targetInfo.target,
        resolvedPath: targetInfo.resolvedPath,
        downloadPath: targetInfo.downloadPath,
        fileName: targetInfo.fileName,
        mimeType,
        dataUrl: `data:${mimeType};base64,${prepared.buffer.toString('base64')}`,
        size: originalBuffer.byteLength,
        ...(prepared.width ? { width: prepared.width } : {}),
        ...(prepared.height ? { height: prepared.height } : {})
      })
    }

    return items
  }

  private buildPendingBatchKey(
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    toolCallId: string
  ): string {
    const threadId =
      typeof configurable?.['thread_id'] === 'string' && configurable['thread_id']
        ? configurable['thread_id']
        : 'thread'
    const agentKey =
      typeof configurable?.['agentKey'] === 'string' && configurable['agentKey']
        ? configurable['agentKey']
        : 'agent'

    return `${threadId}:${agentKey}:${toolCallId}`
  }

  private pruneExpiredBatches(now = Date.now()) {
    for (const [key, batch] of this.pendingViewedImageBatches.entries()) {
      if (batch.expiresAt <= now) {
        this.pendingViewedImageBatches.delete(key)
      }
    }
  }
}

function buildToolSuccessMessage(items: ViewedImageItem[]) {
  const files = items.map((item) => item.fileName).join(', ')
  return `Loaded ${items.length} image(s) from sandbox: ${files}. The system will attach them automatically on the next model step.`
}

function buildImageAttachmentText(items: ViewedImageItem[]) {
  const fileList = items.map((item) => `${item.fileName} (${item.target})`).join(', ')
  return `The following image files were loaded with \`${VIEW_IMAGE_TOOL_NAME}\`. Use them to answer the user's request: ${fileList}.`
}

function getSandboxBackendFromConfig(runConfig?: RunnableConfig) {
  const backend = (runConfig?.configurable as TAgentRunnableConfigurable | undefined)?.sandbox?.backend
  if (backend && typeof (backend as BaseSandbox).downloadFiles === 'function') {
    return backend as BaseSandbox
  }
  return null
}

function normalizeTargets(value: z.infer<typeof ViewImageToolInputSchema>['path']) {
  const items = Array.isArray(value) ? value : [value]
  const normalized = items.map((item) => item.trim()).filter(Boolean)

  if (normalized.length === 0) {
    throw new Error('`view_image` requires at least one non-empty image path.')
  }

  if (normalized.length > DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL) {
    throw new Error(
      `\`view_image\` accepts at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call. Pass fewer files in one request.`
    )
  }

  return Array.from(new Set(normalized))
}

function resolveImageTarget(target: string, workingDirectory: string): ResolvedImageTarget {
  if (target.includes('\u0000')) {
    throw new Error('Image paths cannot contain NUL bytes.')
  }

  if (target.startsWith('workspace://')) {
    throw new Error(
      '`workspace://` paths are not supported by this V1 middleware. Use a relative path or an absolute path inside the current sandbox working directory instead.'
    )
  }

  if (target.startsWith('attachment://')) {
    throw new Error('`attachment://` paths are not supported by this V1 middleware.')
  }

  const resolvedPath = path.isAbsolute(target)
    ? path.normalize(target)
    : path.resolve(path.normalize(workingDirectory), target)

  if (!isWithinWorkingDirectory(resolvedPath, workingDirectory)) {
    throw new Error(buildOutsideWorkingDirectoryMessage(target))
  }

  return {
    target,
    resolvedPath,
    downloadPath: toDownloadPath(path.normalize(workingDirectory), resolvedPath),
    fileName: path.basename(resolvedPath)
  }
}

function resolveStoredImageTarget(item: ViewedImageBatchMetadata['items'][number], workingDirectory: string): ResolvedImageTarget {
  const resolvedPath = normalizeResolvedPath(item.resolvedPath, workingDirectory)
  if (!isWithinWorkingDirectory(resolvedPath, workingDirectory)) {
    throw new Error(buildOutsideWorkingDirectoryMessage(item.target))
  }

  return {
    target: item.target,
    resolvedPath,
    downloadPath: toDownloadPath(path.normalize(workingDirectory), resolvedPath),
    fileName: path.basename(resolvedPath)
  }
}

function toDownloadPath(workingDirectory: string, resolvedPath: string) {
  const relativePath = path.relative(workingDirectory, resolvedPath)
  if (!relativePath || relativePath === '.') {
    return path.basename(resolvedPath)
  }

  if (relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error(buildOutsideWorkingDirectoryMessage(resolvedPath))
  }

  return relativePath
}

function toViewedImageBatchMetadata(batch: ViewedImageBatch): ViewedImageBatchMetadata {
  return {
    toolCallId: batch.toolCallId,
    createdAt: batch.createdAt,
    items: batch.items.map((item) => ({
      target: item.target,
      resolvedPath: item.resolvedPath,
      downloadPath: item.downloadPath,
      fileName: item.fileName,
      mimeType: item.mimeType,
      size: item.size,
      ...(item.width ? { width: item.width } : {}),
      ...(item.height ? { height: item.height } : {})
    }))
  }
}

function getViewedImageBatchMetadata(toolMessage: ToolMessage | null): ViewedImageBatchMetadata | null {
  if (!toolMessage?.metadata || typeof toolMessage.metadata !== 'object') {
    return null
  }

  const parsed = ViewedImageBatchMetadataSchema.safeParse(
    (toolMessage.metadata as Record<string, unknown>)[VIEW_IMAGE_METADATA_KEY]
  )
  return parsed.success ? parsed.data : null
}

function getSandboxWorkingDirectory(configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined) {
  const sandbox = configurable?.['sandbox']
  if (!sandbox || typeof sandbox !== 'object') {
    return null
  }

  const workingDirectory = (sandbox as Record<string, unknown>)['workingDirectory']
  return typeof workingDirectory === 'string' ? workingDirectory : null
}

function normalizeWorkingDirectory(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const normalized = path.normalize(trimmed)
  return path.isAbsolute(normalized) ? normalized : path.resolve(DEFAULT_SANDBOX_ROOT, normalized)
}

function normalizeResolvedPath(value: string, workingDirectory: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Stored `view_image` metadata is missing a resolved path.')
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(path.normalize(workingDirectory), trimmed)
}

function isWithinWorkingDirectory(targetPath: string, workingDirectory: string) {
  const relativePath = path.relative(path.normalize(workingDirectory), path.normalize(targetPath))
  return relativePath === '' || (!relativePath.startsWith('../') && relativePath !== '..' && !path.isAbsolute(relativePath))
}

function buildOutsideWorkingDirectoryMessage(target: string) {
  return `Path "${target}" is outside the current sandbox working directory.`
}

function detectImageMimeType(buffer: Buffer): (typeof VIEW_IMAGE_ALLOWED_MIME_TYPES)[number] | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

async function prepareImageForModel(buffer: Buffer): Promise<PreparedImage> {
  try {
    const specifier = 'sharp'
    const sharpModule = await import(specifier)
    const sharp = (sharpModule as Record<string, unknown>).default as
      | ((input: Buffer, options?: Record<string, unknown>) => any)
      | undefined
    if (typeof sharp !== 'function') {
      return { buffer }
    }

    const image = sharp(buffer, { animated: false })
    const metadata = await image.metadata()
    const width = typeof metadata.width === 'number' ? metadata.width : undefined
    const height = typeof metadata.height === 'number' ? metadata.height : undefined

    let pipeline = image
    if (width && height && Math.max(width, height) > DEFAULT_VIEW_IMAGE_MAX_EDGE) {
      pipeline = image.resize({
        width: DEFAULT_VIEW_IMAGE_MAX_EDGE,
        height: DEFAULT_VIEW_IMAGE_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true
      })
    }

    return {
      buffer: await pipeline.toBuffer(),
      width,
      height
    }
  } catch {
    return { buffer }
  }
}

function findReadyToolCallSet(messages: BaseMessage[]): ReadyToolCallSet | null {
  if (!messages.length) {
    return null
  }

  const trailingToolMessages: ToolMessage[] = []

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (!message || !isToolMessage(message)) {
      if (trailingToolMessages.length === 0 || !isAIMessage(message)) {
        return null
      }

      const aiMessage = message as AIMessage
      const toolCalls = aiMessage.tool_calls ?? []
      if (toolCalls.length === 0) {
        return null
      }

      const expectedToolCallIds = new Set(toolCalls.map((toolCall) => toolCall.id).filter(Boolean))
      const toolMessagesById = trailingToolMessages.reduce<Map<string, ToolMessage>>((map, toolMessage) => {
        if (toolMessage.tool_call_id && expectedToolCallIds.has(toolMessage.tool_call_id) && !map.has(toolMessage.tool_call_id)) {
          map.set(toolMessage.tool_call_id, toolMessage)
        }
        return map
      }, new Map())

      if (
        toolMessagesById.size !== expectedToolCallIds.size ||
        trailingToolMessages.some((toolMessage) => !expectedToolCallIds.has(toolMessage.tool_call_id))
      ) {
        return null
      }

      return {
        toolCalls,
        toolMessagesById
      }
    }

    trailingToolMessages.unshift(message as ToolMessage)
  }

  return null
}

function toSystemMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as Record<string, unknown>).text ?? '')
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
      .trim()
  }

  return ''
}

function buildDownloadErrorMessage(target: string, error: string) {
  switch (error) {
    case 'file_not_found':
      return `Image "${target}" was not found in the sandbox workspace.`
    case 'permission_denied':
      return `Permission denied while reading image "${target}".`
    case 'is_directory':
      return `Path "${target}" is a directory, not an image file.`
    case 'invalid_path':
      return `Path "${target}" is not allowed in the current sandbox working directory.`
    default:
      return `Failed to read image "${target}".`
  }
}
