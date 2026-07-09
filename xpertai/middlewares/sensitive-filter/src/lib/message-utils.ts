import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, BaseMessage, HumanMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { INTERNAL_SOURCE_STREAM_TAG } from './constants.js'
import type { BufferedOutputResolution } from './runtime-types.js'
import { extractPrimitiveText, isRecord } from './utils.js'

export function extractModelResponseText(response: any): string {
  if (typeof response === 'string') {
    return response
  }

  if (isRecord(response)) {
    return extractPrimitiveText(response['content'])
  }

  return ''
}

export function replaceModelResponseText(response: any, text: string): AIMessage {
  if (isRecord(response) && 'content' in response) {
    response['content'] = text
    return response as unknown as AIMessage
  }

  return new AIMessage(text)
}

export function cloneAiMessage(source: AIMessage): AIMessage {
  return new AIMessage({
    content: source.content,
    additional_kwargs: source.additional_kwargs,
    response_metadata: source.response_metadata,
    tool_calls: source.tool_calls,
    invalid_tool_calls: source.invalid_tool_calls,
    usage_metadata: source.usage_metadata,
    id: source.id,
    name: source.name,
  })
}

export function cloneAiMessageWithText(source: AIMessage, text: string): AIMessage {
  const cloned = cloneAiMessage(source)
  cloned.content = text
  return cloned
}

function toAiMessageChunk(value: unknown): AIMessageChunk | null {
  if (value instanceof AIMessageChunk) {
    return value
  }

  if (!isRecord(value) || !('content' in value)) {
    return null
  }

  return new AIMessageChunk({
    content: value['content'] as any,
    additional_kwargs: isRecord(value['additional_kwargs']) ? value['additional_kwargs'] : {},
    response_metadata: isRecord(value['response_metadata']) ? value['response_metadata'] : {},
    tool_call_chunks: Array.isArray(value['tool_call_chunks']) ? value['tool_call_chunks'] : [],
    tool_calls: Array.isArray(value['tool_calls']) ? value['tool_calls'] : [],
    invalid_tool_calls: Array.isArray(value['invalid_tool_calls']) ? value['invalid_tool_calls'] : [],
    usage_metadata: isRecord(value['usage_metadata']) ? (value['usage_metadata'] as any) : undefined,
    id: typeof value['id'] === 'string' ? value['id'] : undefined,
  })
}

function toAiMessage(value: unknown): AIMessage {
  if (value instanceof AIMessage) {
    return value
  }

  if (value instanceof AIMessageChunk) {
    return new AIMessage({
      content: value.content,
      additional_kwargs: value.additional_kwargs,
      response_metadata: value.response_metadata,
      tool_calls: value.tool_calls,
      invalid_tool_calls: value.invalid_tool_calls,
      usage_metadata: value.usage_metadata,
      id: value.id,
      name: value.name,
    })
  }

  if (isRecord(value) && 'content' in value) {
    return new AIMessage({
      content: value['content'] as any,
      additional_kwargs: isRecord(value['additional_kwargs']) ? value['additional_kwargs'] : {},
      response_metadata: isRecord(value['response_metadata']) ? value['response_metadata'] : {},
      tool_calls: Array.isArray(value['tool_calls']) ? value['tool_calls'] : [],
      invalid_tool_calls: Array.isArray(value['invalid_tool_calls']) ? value['invalid_tool_calls'] : [],
      usage_metadata: isRecord(value['usage_metadata']) ? (value['usage_metadata'] as any) : undefined,
      id: typeof value['id'] === 'string' ? value['id'] : undefined,
      name: typeof value['name'] === 'string' ? value['name'] : undefined,
    })
  }

  return new AIMessage(extractPrimitiveText(value))
}

function buildInternalSourceOptions(options: Record<string, any> | undefined) {
  const tags = Array.isArray(options?.tags) ? options.tags : []
  const metadata = isRecord(options?.metadata) ? options.metadata : {}

  return {
    ...(options ?? {}),
    tags: [...tags, INTERNAL_SOURCE_STREAM_TAG],
    metadata: {
      ...metadata,
      internal: true,
    },
  }
}

export class BufferedOutputProxyChatModel extends BaseChatModel {
  constructor(
    private readonly innerModel: BaseLanguageModel,
    private readonly resolveOutput: (message: AIMessage, outputText: string) => Promise<BufferedOutputResolution>,
  ) {
    super({})
  }

  override _llmType() {
    return 'sensitive-filter-output-proxy'
  }

  private async collectInnerMessage(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): Promise<AIMessage> {
    const internalOptions = buildInternalSourceOptions(options)
    const streamFn = (this.innerModel as any)?.stream

    if (typeof streamFn === 'function') {
      const stream = await streamFn.call(this.innerModel, messages, internalOptions)
      if (stream && typeof (stream as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function') {
        let mergedChunk: AIMessageChunk | null = null
        for await (const rawChunk of stream as AsyncIterable<unknown>) {
          const chunk = toAiMessageChunk(rawChunk)
          if (!chunk) {
            continue
          }
          mergedChunk = mergedChunk ? mergedChunk.concat(chunk) : chunk
        }

        if (mergedChunk) {
          return toAiMessage(mergedChunk)
        }
      }
    }

    return toAiMessage(await (this.innerModel as any).invoke(messages, internalOptions))
  }

  private async finalizeMessage(
    messages: BaseMessage[],
    options?: Record<string, any>,
  ): Promise<BufferedOutputResolution> {
    const sourceMessage = await this.collectInnerMessage(messages, options)
    return this.resolveOutput(sourceMessage, extractPrimitiveText(sourceMessage.content))
  }

  override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): Promise<ChatResult> {
    const resolved = await this.finalizeMessage(messages, options as Record<string, any> | undefined)
    return {
      generations: [
        {
          text: extractPrimitiveText(resolved.finalMessage.content),
          message: resolved.finalMessage,
        },
      ],
    }
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const resolved = await this.finalizeMessage(messages, options as Record<string, any> | undefined)
    const finalText = extractPrimitiveText(resolved.finalMessage.content)

    if (!finalText) {
      return
    }

    const generationChunk = new ChatGenerationChunk({
      message: new AIMessageChunk({
        content: finalText,
        id: resolved.finalMessage.id,
      }),
      text: finalText,
    })

    yield generationChunk
    await runManager?.handleLLMNewToken(finalText, undefined, undefined, undefined, undefined, {
      chunk: generationChunk,
    })
  }
}

export function rewriteModelRequestInput(request: any, rewrittenText: string): any {
  if (!Array.isArray(request?.messages) || request.messages.length === 0) {
    return request
  }

  const messages = [...request.messages]
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as any
    const messageType = typeof message?._getType === 'function' ? message._getType() : message?.type
    if (messageType !== 'human') {
      continue
    }

    const content = message?.content
    if (typeof content === 'string') {
      messages[i] = new HumanMessage(rewrittenText)
      return { ...request, messages }
    }

    if (Array.isArray(content)) {
      let replaced = false
      const nextContent = content.map((part: any) => {
        if (!replaced && isRecord(part) && part['type'] === 'text') {
          replaced = true
          return {
            ...part,
            text: rewrittenText,
          }
        }
        return part
      })

      if (!replaced) {
        nextContent.push({
          type: 'text',
          text: rewrittenText,
        })
      }

      messages[i] = new HumanMessage({ content: nextContent } as any)
      return { ...request, messages }
    }

    messages[i] = new HumanMessage(rewrittenText)
    return { ...request, messages }
  }

  return request
}
