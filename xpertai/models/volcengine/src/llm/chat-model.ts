import { AsyncLocalStorage } from 'node:async_hooks'
import type { BaseMessage } from '@langchain/core/messages'
import { isAIMessage } from '@langchain/core/messages'
import type { OpenAIClient } from '@langchain/openai'
import { ChatOAICompatReasoningModel } from '@xpert-ai/plugin-sdk'

// LangChain 0.6 drops provider reasoning fields during request conversion.
// Invocation-local history must survive the different streaming/non-streaming options conversions.
export class ArkReasoningChatModel extends ChatOAICompatReasoningModel {
  private readonly histories = new AsyncLocalStorage<BaseMessage[]>()

  override async _generate(...args: Parameters<ChatOAICompatReasoningModel['_generate']>) {
    return this.histories.run(args[0], () => super._generate(...args))
  }

  override async *_streamResponseChunks(...args: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>) {
    const stream = super._streamResponseChunks(...args)
    try {
      while (true) {
        const next = await this.histories.run(args[0], () => stream.next())
        if (next.done) return
        yield next.value
      }
    } finally {
      await this.histories.run(args[0], () => stream.return(undefined))
    }
  }

  override completionWithRetry(request: OpenAIClient.ChatCompletionCreateParamsStreaming,
    options?: OpenAIClient.RequestOptions): Promise<AsyncIterable<OpenAIClient.ChatCompletionChunk>>
  override completionWithRetry(request: OpenAIClient.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAIClient.RequestOptions): Promise<OpenAIClient.ChatCompletion>
  override completionWithRetry(
    request: OpenAIClient.ChatCompletionCreateParamsStreaming | OpenAIClient.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAIClient.RequestOptions
  ): Promise<AsyncIterable<OpenAIClient.ChatCompletionChunk> | OpenAIClient.ChatCompletion> {
    const history = this.histories.getStore()
    const assistants = history?.filter(isAIMessage) ?? []
    let index = 0
    const messages = request.messages.map((message) => {
      // LangChain may emit a separate assistant audio-reference message after its content message.
      if (message.role !== 'assistant' || (!('content' in message) && message.audio)) return message
      const original = assistants[index++]
      if (!original) return message
      const reasoning = original.additional_kwargs.reasoning_content
      const encrypted = original.additional_kwargs.encrypted_content
      return { ...message,
        ...(typeof reasoning === 'string' ? { reasoning_content: reasoning } : {}),
        ...(typeof encrypted === 'string' ? { encrypted_content: encrypted } : {})
      }
    })
    return request.stream
      ? super.completionWithRetry({ ...request, messages, stream: true }, options)
      : super.completionWithRetry({ ...request, messages, stream: false }, options)
  }

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    ...args: Parameters<ChatOAICompatReasoningModel['_convertCompletionsDeltaToBaseMessageChunk']>
  ) {
    const chunk = super._convertCompletionsDeltaToBaseMessageChunk(...args)
    if (typeof chunk.additional_kwargs.reasoning_content !== 'string') delete chunk.additional_kwargs.reasoning_content
    const encrypted: unknown = args[0].encrypted_content
    if (typeof encrypted === 'string') chunk.additional_kwargs.encrypted_content = encrypted
    return chunk
  }

  protected override _convertCompletionsMessageToBaseMessage(
    ...args: Parameters<ChatOAICompatReasoningModel['_convertCompletionsMessageToBaseMessage']>
  ) {
    const message = super._convertCompletionsMessageToBaseMessage(...args)
    const raw = args[0]
    if ('encrypted_content' in raw && typeof raw.encrypted_content === 'string') {
      message.additional_kwargs.encrypted_content = raw.encrypted_content
    }
    return message
  }
}
