import { AIMessage, AIMessageChunk } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { ChatOpenAIResponses, OpenAIClient } from '@langchain/openai'

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

export class OpenAIReasoningResponsesModel extends ChatOpenAIResponses {
  protected override _convertResponsesMessageToBaseMessage(
    response: OpenAIClient.Responses.Response
  ) {
    const message = super._convertResponsesMessageToBaseMessage(response) as AIMessage
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
