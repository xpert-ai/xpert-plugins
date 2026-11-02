import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { ChatOpenAIResponses, OpenAIClient } from '@langchain/openai'
import { getSupportedOpenAIReasoningEfforts, shouldEnableSamplingParameters } from '../types.js'

type OpenAIReasoningSummaryPart = {
  text?: string
}

type OpenAIReasoningSummary = {
  summary?: OpenAIReasoningSummaryPart[]
}

function extractReasoningSummaryText(reasoning: unknown): string | undefined {
  if (!reasoning || typeof reasoning !== 'object') {
    return undefined
  }

  const summary = (reasoning as OpenAIReasoningSummary).summary
  if (!Array.isArray(summary)) {
    return undefined
  }

  const text = summary
    .map((item) => (typeof item?.text === 'string' ? item.text : ''))
    .join('')
    .trim()

  return text || undefined
}

function extractReasoningDeltaText(chunk: OpenAIClient.Responses.ResponseStreamEvent): string | undefined {
  if (chunk.type === 'response.reasoning_summary_text.delta') {
    return chunk.delta || undefined
  }

  if (chunk.type === 'response.reasoning_summary_part.added' && typeof chunk.part?.text === 'string') {
    return chunk.part.text || undefined
  }

  return undefined
}

function normalizeResponseUsage(usage: OpenAIClient.Responses.Response['usage']): AIMessage['usage_metadata'] {
  if (!usage) return undefined
  return {
    ...usage,
    ...(usage.input_tokens_details ? { input_token_details: { cache_read: usage.input_tokens_details.cached_tokens } } : {}),
    ...(usage.output_tokens_details ? { output_token_details: { reasoning: usage.output_tokens_details.reasoning_tokens } } : {})
  }
}

export class OpenAIReasoningResponsesModel extends ChatOpenAIResponses {
  protected override _getReasoningParams(options?: this['ParsedCallOptions']): OpenAIClient.Reasoning | undefined {
    // LangChain 0.6.9 only recognizes GPT-5/o-series reasoning; use our explicit catalog.
    if (getSupportedOpenAIReasoningEfforts(this.model)) {
      return { ...this.reasoning, ...options?.reasoning }
    }
    return super._getReasoningParams(options)
  }

  override invocationParams(options?: this['ParsedCallOptions']): ReturnType<ChatOpenAIResponses['invocationParams']> {
    const params = super.invocationParams(options)
    if (!shouldEnableSamplingParameters('enabled', this.clientConfig.baseURL, this.model, params.reasoning?.effort)) {
      delete params.temperature
      delete params.top_p
    }
    return params
  }

  protected override _convertResponsesMessageToBaseMessage(
    response: OpenAIClient.Responses.Response
  ) {
    const message = super._convertResponsesMessageToBaseMessage(response) as AIMessage
    message.usage_metadata = normalizeResponseUsage(response.usage)
    const reasoningContent = extractReasoningSummaryText(message.additional_kwargs?.reasoning)

    if (reasoningContent) {
      message.additional_kwargs = {
        ...message.additional_kwargs,
        reasoning_content: reasoningContent
      }
    }

    return message
  }

  protected override _convertResponsesDeltaToBaseMessageChunk(
    chunk: OpenAIClient.Responses.ResponseStreamEvent
  ): ChatGenerationChunk | null {
    const generationChunk = super._convertResponsesDeltaToBaseMessageChunk(chunk)
    if (!generationChunk) {
      return null
    }

    const message = generationChunk.message as AIMessageChunk
    if (chunk.type === 'response.completed') {
      message.usage_metadata = normalizeResponseUsage(chunk.response.usage)
    }
    const reasoningContent =
      extractReasoningDeltaText(chunk) ?? extractReasoningSummaryText(message.additional_kwargs?.reasoning)

    if (reasoningContent) {
      message.additional_kwargs = {
        ...message.additional_kwargs,
        reasoning_content: reasoningContent
      }
      message.content = ''
      generationChunk.text = ''
    }

    return generationChunk
  }
}
