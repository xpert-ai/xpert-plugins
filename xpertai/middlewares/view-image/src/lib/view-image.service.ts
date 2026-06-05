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
  DEFAULT_VIEW_IMAGE_MAX_IMAGE_BYTES,
  DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL,
  VIEW_IMAGE_ALLOWED_MIME_TYPES,
  VIEW_IMAGE_METADATA_KEY,
  VIEW_IMAGE_TOOL_NAME,
  type ViewImageMiddlewareConfig,
  ViewImageMiddlewareConfigSchema,
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

  resolveMiddlewareConfig(config?: Partial<ViewImageMiddlewareConfig>): ViewImageMiddlewareConfig {
    return ViewImageMiddlewareConfigSchema.parse(config ?? {})
  }

  buildSystemPrompt(): string {
    return [
      '<skill>',
      'When the user asks about an image file in the sandbox workspace root, call `view_image` before reasoning about the image contents.',
      `Pass at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} image paths in one \`view_image\` call when you already know the files you need.`,
      `Do not load more than ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images total in the same model step. If you need ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL + 1} or more known images, load the next batch in a later model step after using the current images.`,
      `You may call \`view_image\` multiple times in the same step only when discovery is incremental and the total loaded images for that step stays at ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} or fewer.`,
      'Prefer relative paths from the sandbox workspace root, such as `sessions/thread/files/page.png`. Absolute `/workspace/...` paths and `workspace://...` paths are supported when they stay inside that same workspace root.',
      'Do not guess what an image contains unless it has been loaded with `view_image`.',
      '</skill>'
    ].join('\n')
  }

  createTool(config: ViewImageMiddlewareConfig = this.resolveMiddlewareConfig()): DynamicStructuredTool {
    return tool(
      async (input, runConfig) => {
        const backend = getSandboxBackendFromConfig(runConfig)
        if (!backend) {
          throw new Error('Sandbox backend is not available for `view_image`.')
        }

        this.pruneExpiredBatches()

        const toolCallId = getToolCallIdFromConfig(runConfig) ?? VIEW_IMAGE_TOOL_NAME
        const workspaceRoot = this.resolveVisibleWorkspaceRoot(runConfig?.configurable, backend)
        const targets = normalizeTargets(input)
        const items = await this.loadViewedImageItems(backend, targets, workspaceRoot, config)
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
          `Load one or more image files from the sandbox workspace root so the next model step can inspect them. Use this before answering questions about workspace image files by path. Accepts at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call and per model step; load ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL + 1}+ known images across separate model steps, not multiple same-step calls.`,
        schema: ViewImageToolInputSchema
      }
    )
  }

  async prepareModelRequest<TState extends Record<string, unknown>>(
    request: ModelRequest<TState>,
    backend: ViewImageSandbox,
    config: ViewImageMiddlewareConfig = this.resolveMiddlewareConfig()
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

    const workspaceRoot = this.resolveVisibleWorkspaceRoot(request.runtime?.configurable, backend)
    const batches = await Promise.all(
      viewImageToolCalls.map((toolCall) =>
        this.resolveViewedImageBatch(
          toolCall.id as string,
          readyToolCallSet.toolMessagesById.get(toolCall.id as string) ?? null,
          request.runtime?.configurable,
          backend,
          workspaceRoot,
          config
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
        `The current model step has ${items.length} images loaded via \`${VIEW_IMAGE_TOOL_NAME}\`, exceeding the limit of ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per step. Load additional images in a later model step.`
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
    workspaceRoot: string,
    config: ViewImageMiddlewareConfig = this.resolveMiddlewareConfig()
  ): Promise<ViewedImageItem[]> {
    const resolvedTargets = targets.map((target) => resolveImageTarget(target, workspaceRoot))
    return this.loadViewedImageItemsFromTargets(backend, resolvedTargets, config)
  }

  resolveVisibleWorkspaceRoot(
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    backend: ViewImageSandbox
  ): string {
    const workspaceRoot = normalizeWorkspaceRoot(getSandboxWorkspaceRoot(configurable))
    if (workspaceRoot) {
      return workspaceRoot
    }

    const configured = normalizeWorkspaceRoot(getSandboxWorkingDirectory(configurable))
    if (configured) {
      return configured
    }

    const backendWorkingDirectory = normalizeWorkspaceRoot(backend.workingDirectory)
    if (backendWorkingDirectory) {
      return backendWorkingDirectory
    }

    return DEFAULT_SANDBOX_ROOT
  }

  resolveVisibleWorkingDirectory(
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    backend: ViewImageSandbox
  ): string {
    return this.resolveVisibleWorkspaceRoot(configurable, backend)
  }

  private async resolveViewedImageBatch(
    toolCallId: string,
    toolMessage: ToolMessage | null,
    configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined,
    backend: ViewImageSandbox,
    workspaceRoot: string,
    config: ViewImageMiddlewareConfig
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
        metadata.items.map((item) => resolveStoredImageTarget(item, workspaceRoot)),
        config
      )
    }
  }

  private async loadViewedImageItemsFromTargets(
    backend: ViewImageSandbox,
    targets: ResolvedImageTarget[],
    config: ViewImageMiddlewareConfig
  ): Promise<ViewedImageItem[]> {
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

      const prepared = await prepareImageForModel(originalBuffer, config)
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

function normalizeTargets(input: z.infer<typeof ViewImageToolInputSchema>) {
  const normalized = [
    ...normalizeTargetValue(input.path),
    ...normalizeTargetValue(input.paths)
  ]
  const uniqueTargets = Array.from(new Set(normalized))

  if (uniqueTargets.length === 0) {
    throw new Error('`view_image` requires at least one non-empty image path.')
  }

  if (uniqueTargets.length > DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL) {
    throw new Error(
      `\`view_image\` accepts at most ${DEFAULT_VIEW_IMAGE_MAX_IMAGES_PER_CALL} images per call. Load additional images in a later model step.`
    )
  }

  return uniqueTargets
}

function normalizeTargetValue(value: z.infer<typeof ViewImageToolInputSchema>['path']) {
  if (value === undefined) {
    return []
  }

  const items = Array.isArray(value) ? value : [value]
  return items.flatMap((item) => expandTargetString(item))
}

function expandTargetString(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error('`view_image` JSON array path input must be a valid JSON string array.')
    }

    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new Error('`view_image` JSON array path input must contain only strings.')
    }

    return parsed.map((item) => item.trim()).filter(Boolean)
  }

  return [trimmed]
}

function resolveImageTarget(target: string, workspaceRoot: string): ResolvedImageTarget {
  if (target.includes('\u0000')) {
    throw new Error('Image paths cannot contain NUL bytes.')
  }

  if (target.startsWith('attachment://')) {
    throw new Error(
      '`attachment://` paths are not supported by `view_image`. Use a workspace file path after the attachment is projected into the sandbox workspace.'
    )
  }

  const workspaceTarget = normalizeWorkspaceUriTarget(target)
  if (!workspaceTarget) {
    throw new Error('`view_image` requires a non-empty workspace image path.')
  }

  if (hasUnsupportedUriScheme(workspaceTarget)) {
    throw new Error(
      'Remote or virtual image paths are not supported by `view_image`. Use a file path inside the sandbox workspace root.'
    )
  }

  const resolvedPath = path.isAbsolute(workspaceTarget)
    ? path.normalize(workspaceTarget)
    : path.resolve(path.normalize(workspaceRoot), workspaceTarget)

  if (!isWithinWorkspaceRoot(resolvedPath, workspaceRoot)) {
    throw new Error(buildOutsideWorkspaceRootMessage(target))
  }

  return {
    target,
    resolvedPath,
    downloadPath: toDownloadPath(path.normalize(workspaceRoot), resolvedPath),
    fileName: path.basename(resolvedPath)
  }
}

function resolveStoredImageTarget(item: ViewedImageBatchMetadata['items'][number], workspaceRoot: string): ResolvedImageTarget {
  const resolvedPath = normalizeResolvedPath(item.resolvedPath, workspaceRoot)
  if (!isWithinWorkspaceRoot(resolvedPath, workspaceRoot)) {
    throw new Error(buildOutsideWorkspaceRootMessage(item.target))
  }

  return {
    target: item.target,
    resolvedPath,
    downloadPath: toDownloadPath(path.normalize(workspaceRoot), resolvedPath),
    fileName: path.basename(resolvedPath)
  }
}

function normalizeWorkspaceUriTarget(target: string) {
  if (!target.startsWith('workspace://')) {
    return target
  }

  return target.slice('workspace://'.length).replace(/^\/+/, '')
}

function hasUnsupportedUriScheme(target: string) {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(target)
}

function toDownloadPath(workspaceRoot: string, resolvedPath: string) {
  const relativePath = path.relative(workspaceRoot, resolvedPath)
  if (!relativePath || relativePath === '.') {
    return path.basename(resolvedPath)
  }

  if (relativePath === '..' || relativePath.startsWith('../') || path.isAbsolute(relativePath)) {
    throw new Error(buildOutsideWorkspaceRootMessage(resolvedPath))
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

function getSandboxWorkspaceRoot(configurable: TAgentRunnableConfigurable | Record<string, unknown> | undefined) {
  const sandbox = configurable?.['sandbox']
  if (!sandbox || typeof sandbox !== 'object') {
    return null
  }

  const workspaceRoot = (sandbox as Record<string, unknown>)['workspaceRoot']
  if (typeof workspaceRoot === 'string') {
    return workspaceRoot
  }

  const workspaceBinding = (sandbox as Record<string, unknown>)['workspaceBinding']
  if (!workspaceBinding || typeof workspaceBinding !== 'object' || Array.isArray(workspaceBinding)) {
    return null
  }

  const bindingWorkspaceRoot = (workspaceBinding as Record<string, unknown>)['workspaceRoot']
  return typeof bindingWorkspaceRoot === 'string' ? bindingWorkspaceRoot : null
}

function normalizeWorkspaceRoot(value: unknown): string | null {
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

function normalizeResolvedPath(value: string, workspaceRoot: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error('Stored `view_image` metadata is missing a resolved path.')
  }

  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(path.normalize(workspaceRoot), trimmed)
}

function isWithinWorkspaceRoot(targetPath: string, workspaceRoot: string) {
  const relativePath = path.relative(path.normalize(workspaceRoot), path.normalize(targetPath))
  return relativePath === '' || (!relativePath.startsWith('../') && relativePath !== '..' && !path.isAbsolute(relativePath))
}

function buildOutsideWorkspaceRootMessage(target: string) {
  return `Path "${target}" is outside the current sandbox workspace root.`
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

async function prepareImageForModel(buffer: Buffer, config: ViewImageMiddlewareConfig): Promise<PreparedImage> {
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

    const resizeOptions = buildViewImageResizeOptions(width, height, config.compressionPercent)
    if (!resizeOptions) {
      return {
        buffer,
        width,
        height
      }
    }

    return {
      buffer: await image.resize(resizeOptions).toBuffer(),
      width,
      height
    }
  } catch {
    return { buffer }
  }
}

export function buildViewImageResizeOptions(
  width: number | undefined,
  height: number | undefined,
  compressionPercent: number
) {
  if (!width || !height || compressionPercent >= 100) {
    return null
  }

  return {
    width: Math.max(1, Math.round(width * compressionPercent / 100)),
    height: Math.max(1, Math.round(height * compressionPercent / 100)),
    fit: 'inside' as const,
    withoutEnlargement: true
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
      return `Path "${target}" is not allowed in the current sandbox workspace root.`
    default:
      return `Failed to read image "${target}".`
  }
}
