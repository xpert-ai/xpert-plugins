import { randomUUID } from 'node:crypto'
import { GoogleGenerativeAI, type Content, type Part, type GenerateContentRequest } from '@google/generative-ai'
import { ChatGoogleGenerativeAI, type GoogleGenerativeAIChatInput } from '@langchain/google-genai'
import { AIMessageChunk, isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { buildGeminiInvocationParams, type GeminiModelOptions } from './model-parameters.js'

export const gemini4Models = new Set(['gemini-4-carbon', 'gemini-4-argon', 'gemini-4-hydrogen', 'gemini-4-neon'])
type GeminiPart = Part & { thoughtSignature?: string; thought?: boolean }

function messageParts(message: BaseMessage): Part[] {
  if (typeof message.content === 'string') return message.content ? [{ text: message.content }] : []
  return message.content.map((block): Part => {
    if (block.type === 'text') return { text: block.text }
    if (block.type === 'image_url') {
      const url = typeof block.image_url === 'string' ? block.image_url : block.image_url.url
      const data = /^data:([^;,]+);base64,(.+)$/s.exec(url)
      if (!data) throw new Error('Gemini images require a base64 data URL')
      return { inlineData: { mimeType: data[1], data: data[2] } }
    }
    const mimeType = 'mime_type' in block ? block.mime_type : 'mimeType' in block ? block.mimeType : undefined
    if (typeof mimeType === 'string' && 'data' in block && typeof block.data === 'string') {
      return { inlineData: { mimeType, data: block.data } }
    }
    if (typeof mimeType === 'string' && 'source_type' in block && block.source_type === 'url' && typeof block.url === 'string') {
      return { fileData: { mimeType, fileUri: block.url } }
    }
    if (typeof mimeType === 'string' && 'fileUri' in block && typeof block.fileUri === 'string') {
      return { fileData: { mimeType, fileUri: block.fileUri } }
    }
    throw new Error('Unsupported Gemini content block: ' + block.type)
  })
}

export function gemini4History(messages: BaseMessage[]) {
  const contents: Content[] = []
  const systemParts: Part[] = []
  const names = new Map<string, string>()
  for (const message of messages) {
    if (message._getType() === 'system') {
      systemParts.push(...messageParts(message))
      continue
    }
    let parts: Part[]
    const role = isAIMessage(message) ? 'model' : 'user'
    if (isAIMessage(message)) {
      for (const call of message.tool_calls ?? []) if (call.id) names.set(call.id, call.name)
      // Preserve the original order and placement of opaque signatures, including parallel calls.
      const original = message.additional_kwargs['gemini_parts']
      parts = Array.isArray(original) ? original : [
        ...messageParts(message), ...(message.tool_calls ?? []).map(call => ({ functionCall: { name: call.name, args: call.args } }))
      ]
    } else if (isToolMessage(message)) {
      const name = message.name || names.get(message.tool_call_id)
      if (!name) throw new Error('Gemini tool result is missing its function name')
      parts = [{ functionResponse: { name, response: { result: message.content } } }]
    } else {
      parts = messageParts(message)
    }
    const previous = contents.at(-1)
    if (previous?.role === role) previous.parts.push(...parts)
    else contents.push({ role, parts: [...parts] })
  }
  return { contents, systemInstruction: systemParts.length ? { role: 'system', parts: systemParts } : undefined }
}

export class Gemini4ChatModel extends ChatGoogleGenerativeAI {
  constructor(private readonly fields: GoogleGenerativeAIChatInput, private readonly modelOptions: GeminiModelOptions) {
    super(fields)
  }

  override async _generate(messages: BaseMessage[], options: this['ParsedCallOptions'], manager?: CallbackManagerForLLMRun) {
    let generation: ChatGenerationChunk | undefined
    for await (const chunk of this._streamResponseChunks(messages, options, manager)) {
      generation = generation ? generation.concat(chunk) : chunk
    }
    if (!generation) throw new Error('Gemini returned no candidates')
    return { generations: [generation] }
  }

  override async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions'], manager?: CallbackManagerForLLMRun) {
    const history = gemini4History(messages)
    const params = buildGeminiInvocationParams(super.invocationParams(options), this.modelOptions)
    const client = new GoogleGenerativeAI(this.apiKey!).getGenerativeModel({
      model: this.model, systemInstruction: history.systemInstruction
    }, { baseUrl: this.fields.baseUrl })
    const request: GenerateContentRequest = {
      ...params, contents: history.contents, generationConfig: {
        ...params.generationConfig,
        ...(options.responseSchema ? { responseSchema: options.responseSchema, responseMimeType: 'application/json' } : {})
      }
    } as GenerateContentRequest
    const { stream } = await this.caller.callWithOptions({ signal: options.signal },
      () => client.generateContentStream(request, { signal: options.signal }))
    let index = 0
    let previous = { input: 0, output: 0, total: 0, cached: 0 }
    for await (const event of stream) {
      const candidate = event.candidates?.[0]
      const parts: GeminiPart[] = candidate?.content?.parts ?? []
      const text = parts.filter(part => !part.thought).map(part => part.text ?? '').join('')
      const reasoning = parts.filter(part => part.thought).map(part => part.text ?? '').join('')
      const usage = event.usageMetadata
      const current = usage && { input: usage.promptTokenCount ?? 0, total: usage.totalTokenCount ?? 0,
        output: (usage.totalTokenCount ?? 0) - (usage.promptTokenCount ?? 0), cached: usage.cachedContentTokenCount ?? 0 }
      const message = new AIMessageChunk({
        content: text,
        tool_call_chunks: parts.flatMap(part => part.functionCall ? [{
          name: part.functionCall.name, args: JSON.stringify(part.functionCall.args), id: randomUUID(), index: index++, type: 'tool_call_chunk' as const
        }] : []),
        additional_kwargs: { gemini_parts: parts, ...(reasoning ? { reasoning_content: reasoning } : {}) },
        response_metadata: candidate?.finishReason ? { finishReason: candidate.finishReason } : {},
        usage_metadata: current ? { input_tokens: current.input - previous.input, output_tokens: current.output - previous.output,
          total_tokens: current.total - previous.total, input_token_details: { cache_read: current.cached - previous.cached } } : undefined
      })
      if (current) previous = current
      const chunk = new ChatGenerationChunk({ text, message })
      yield chunk
      await manager?.handleLLMNewToken(text, undefined, undefined, undefined, undefined, { chunk })
    }
  }
}
