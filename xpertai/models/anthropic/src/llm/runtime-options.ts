import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  MessageContent,
  MessageContentComplex,
  SystemMessage,
  ToolMessage,
  isAIMessage,
  isHumanMessage,
  isSystemMessage,
  isToolMessage
} from '@langchain/core/messages'

const cacheControl = { type: 'ephemeral' } as const
const cacheTagPattern = /<cache>([\s\S]*?)<\/cache>/gi

export const AnthropicPromptCachingBeta = 'prompt-caching-2024-07-31'
export const AnthropicContext1MBeta = 'context-1m-2025-08-07'

export type AnthropicPromptCachingOptions = {
  messageFlowThreshold: number
  cacheSystemMessage: boolean
  cacheImages: boolean
  cacheDocuments: boolean
  cacheToolDefinitions: boolean
  cacheToolResults: boolean
}

export function normalizeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  return undefined
}

export function buildAnthropicThinkingConfig(
  enabled: boolean,
  budget?: number
): { type: 'disabled' } | { type: 'enabled'; budget_tokens: number } {
  if (!enabled) {
    return { type: 'disabled' }
  }

  return {
    type: 'enabled',
    budget_tokens: Math.max(1024, normalizeInteger(budget) ?? 1024)
  }
}

export function hasPromptCachingEnabled(
  options?: AnthropicPromptCachingOptions
): boolean {
  if (!options) {
    return false
  }

  return (
    options.messageFlowThreshold > 0 ||
    options.cacheSystemMessage ||
    options.cacheImages ||
    options.cacheDocuments ||
    options.cacheToolDefinitions ||
    options.cacheToolResults
  )
}

export function buildAnthropicBetaHeader(options: {
  context1m?: boolean
  promptCaching?: AnthropicPromptCachingOptions
}): string | undefined {
  const betas: string[] = []

  if (options.context1m) {
    betas.push(AnthropicContext1MBeta)
  }

  if (hasPromptCachingEnabled(options.promptCaching)) {
    betas.push(AnthropicPromptCachingBeta)
  }

  return betas.length > 0 ? betas.join(',') : undefined
}

export function applyPromptCachingToTools<T extends Record<string, any>>(
  tools: T[] | undefined,
  enabled: boolean
): T[] | undefined {
  if (!enabled || !tools?.length) {
    return tools
  }

  return tools.map((tool) =>
    tool.cache_control
      ? tool
      : {
          ...tool,
          cache_control: cacheControl
        }
  )
}

export function prepareAnthropicMessages(
  messages: BaseMessage[],
  promptCaching?: AnthropicPromptCachingOptions
): BaseMessage[] {
  if (!hasPromptCachingEnabled(promptCaching)) {
    return messages
  }

  return messages.map((message) => prepareAnthropicMessage(message, promptCaching))
}

function prepareAnthropicMessage(
  message: BaseMessage,
  promptCaching: AnthropicPromptCachingOptions
): BaseMessage {
  const cacheByThreshold =
    promptCaching.messageFlowThreshold > 0 &&
    (isHumanMessage(message) || isAIMessage(message)) &&
    countContentWords(message.content) >= promptCaching.messageFlowThreshold

  const cacheToolResultText = isToolMessage(message) && promptCaching.cacheToolResults
  const parseSystemCacheTags = isSystemMessage(message) && promptCaching.cacheSystemMessage

  const nextContent = prepareMessageContent(message.content, {
    cacheText: cacheByThreshold || cacheToolResultText,
    parseSystemCacheTags,
    cacheImages: promptCaching.cacheImages,
    cacheDocuments: promptCaching.cacheDocuments
  })

  if (nextContent === message.content) {
    return message
  }

  return cloneMessageWithContent(message, nextContent)
}

function prepareMessageContent(
  content: MessageContent,
  options: {
    cacheText: boolean
    parseSystemCacheTags: boolean
    cacheImages: boolean
    cacheDocuments: boolean
  }
): MessageContent {
  if (typeof content === 'string') {
    return prepareStringContent(content, options)
  }

  let changed = false
  const nextContent: MessageContentComplex[] = []

  for (const part of content) {
    const transformedParts = transformContentPart(part, options)
    if (transformedParts.length !== 1 || transformedParts[0] !== part) {
      changed = true
    }
    nextContent.push(...transformedParts)
  }

  return changed ? nextContent : content
}

function prepareStringContent(
  content: string,
  options: {
    cacheText: boolean
    parseSystemCacheTags: boolean
  }
): MessageContent {
  if (options.cacheText) {
    return [toTextBlock(stripCacheTags(content), true)]
  }

  if (options.parseSystemCacheTags && cacheTagPattern.test(content)) {
    cacheTagPattern.lastIndex = 0
    return splitCachedText(content)
  }

  return content
}

function transformContentPart(
  part: MessageContentComplex,
  options: {
    cacheText: boolean
    parseSystemCacheTags: boolean
    cacheImages: boolean
    cacheDocuments: boolean
  }
): MessageContentComplex[] {
  if (typeof part !== 'object' || part == null) {
    return [part]
  }

  const contentPart = part as Record<string, any>

  if (isTextPart(contentPart)) {
    if (options.cacheText) {
      return [
        {
          ...contentPart,
          text: stripCacheTags(contentPart.text),
          cache_control: contentPart.cache_control ?? cacheControl
        }
      ]
    }

    if (options.parseSystemCacheTags && cacheTagPattern.test(contentPart.text)) {
      cacheTagPattern.lastIndex = 0
      return splitCachedText(contentPart.text)
    }

    return [part]
  }

  if (options.cacheImages && contentPart.type === 'image_url') {
    return [
      {
        ...contentPart,
        cache_control: contentPart.cache_control ?? cacheControl
      }
    ]
  }

  if (options.cacheDocuments && contentPart.type === 'document') {
    return [
      {
        ...contentPart,
        cache_control: contentPart.cache_control ?? cacheControl
      }
    ]
  }

  return [part]
}

function splitCachedText(text: string): MessageContentComplex[] {
  const parts: MessageContentComplex[] = []
  let lastIndex = 0

  cacheTagPattern.lastIndex = 0

  for (const match of text.matchAll(cacheTagPattern)) {
    const [fullMatch, cachedSegment] = match
    const matchIndex = match.index ?? 0

    if (matchIndex > lastIndex) {
      parts.push(toTextBlock(text.slice(lastIndex, matchIndex), false))
    }

    if (cachedSegment) {
      parts.push(toTextBlock(cachedSegment, true))
    }

    lastIndex = matchIndex + fullMatch.length
  }

  if (lastIndex < text.length) {
    parts.push(toTextBlock(text.slice(lastIndex), false))
  }

  return parts.filter((part) => {
    const contentPart = part as Record<string, any>
    return typeof contentPart.text !== 'string' || contentPart.text.length > 0
  })
}

function stripCacheTags(text: string): string {
  return text.replace(/<\/?cache>/gi, '')
}

function toTextBlock(text: string, cached: boolean): MessageContentComplex {
  return cached
    ? {
        type: 'text',
        text,
        cache_control: cacheControl
      }
    : {
        type: 'text',
        text
      }
}

function isTextPart(part: Record<string, any>): part is Record<string, any> & {
  text: string
} {
  return typeof part.text === 'string' && (part.type === 'text' || part.type == null)
}

function countContentWords(content: MessageContent): number {
  const text = typeof content === 'string' ? content : content.map(extractTextFromPart).join(' ')
  const normalized = stripCacheTags(text).trim()

  if (!normalized) {
    return 0
  }

  return normalized.split(/\s+/).filter(Boolean).length
}

function extractTextFromPart(part: MessageContentComplex): string {
  if (typeof part !== 'object' || part == null) {
    return ''
  }

  const contentPart = part as Record<string, any>

  if (typeof contentPart.text === 'string') {
    return contentPart.text
  }

  return ''
}

function cloneMessageWithContent(
  message: BaseMessage,
  content: MessageContent
): BaseMessage {
  const baseFields = {
    content,
    name: message.name,
    additional_kwargs: message.additional_kwargs,
    response_metadata: message.response_metadata,
    id: message.id
  }

  if (isHumanMessage(message)) {
    return new HumanMessage(baseFields)
  }

  if (isSystemMessage(message)) {
    return new SystemMessage(baseFields)
  }

  if (isAIMessage(message)) {
    const aiMessage = message as AIMessage
    return new AIMessage({
      ...baseFields,
      tool_calls: aiMessage.tool_calls,
      invalid_tool_calls: aiMessage.invalid_tool_calls,
      usage_metadata: aiMessage.usage_metadata
    })
  }

  if (isToolMessage(message)) {
    const toolMessage = message as ToolMessage
    return new ToolMessage({
      ...baseFields,
      artifact: toolMessage.artifact,
      metadata: toolMessage.metadata,
      status: toolMessage.status,
      tool_call_id: toolMessage.tool_call_id
    })
  }

  return message
}
