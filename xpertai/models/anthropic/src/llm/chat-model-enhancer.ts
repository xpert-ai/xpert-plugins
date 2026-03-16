import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { ChatAnthropic } from '@langchain/anthropic'
import { AnthropicPromptCachingOptions, applyPromptCachingToTools, prepareAnthropicMessages } from './runtime-options.js'

type PatchableChatAnthropic = ChatAnthropic & {
  formatStructuredToolToAnthropic: (...args: any[]) => any
  _streamResponseChunks?: (
    messages: BaseMessage[],
    options: Record<string, any>,
    runManager?: CallbackManagerForLLMRun
  ) => AsyncGenerator<ChatGenerationChunk>
  _generateNonStreaming?: (
    messages: BaseMessage[],
    params: Record<string, any>,
    requestOptions: Record<string, any>
  ) => Promise<any>
}

export function enhanceChatAnthropicWithPromptCaching(
  model: ChatAnthropic,
  promptCaching: AnthropicPromptCachingOptions
): ChatAnthropic {
  const patchableModel = model as PatchableChatAnthropic
  const originalFormatTools = patchableModel.formatStructuredToolToAnthropic.bind(patchableModel)

  patchableModel.formatStructuredToolToAnthropic = ((...args: any[]) =>
    applyPromptCachingToTools(
      originalFormatTools(...args),
      promptCaching.cacheToolDefinitions
    )) as PatchableChatAnthropic['formatStructuredToolToAnthropic']

  if (typeof patchableModel._streamResponseChunks === 'function') {
    const originalStreamResponseChunks = patchableModel._streamResponseChunks.bind(patchableModel)
    patchableModel._streamResponseChunks = (
      messages: BaseMessage[],
      options: Record<string, any>,
      runManager?: CallbackManagerForLLMRun
    ) =>
      originalStreamResponseChunks(
        prepareAnthropicMessages(messages, promptCaching),
        options,
        runManager
      )
  }

  if (typeof patchableModel._generateNonStreaming === 'function') {
    const originalGenerateNonStreaming = patchableModel._generateNonStreaming.bind(patchableModel)
    patchableModel._generateNonStreaming = (
      messages: BaseMessage[],
      params: Record<string, any>,
      requestOptions: Record<string, any>
    ) =>
      originalGenerateNonStreaming(
        prepareAnthropicMessages(messages, promptCaching),
        params,
        requestOptions
      )
  }

  return model
}
