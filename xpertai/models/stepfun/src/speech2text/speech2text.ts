import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { SpeechToTextModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { StepfunProviderStrategy } from '../provider.strategy.js'
import { StepfunBaseUrl, type StepfunCredentials } from '../types.js'
import { readStepAudio } from './audio-input.js'

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('transcript.text.delta'), delta: z.string() }),
  z.object({ type: z.literal('transcript.text.done'), text: z.string(), usage: z.object({
    input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative()
  }).optional() }),
  z.object({ type: z.literal('error') })
])

@Injectable()
export class StepfunSpeech2TextModel extends SpeechToTextModel {
  constructor(provider: StepfunProviderStrategy) { super(provider, AiModelTypeEnum.SPEECH2TEXT) }
  async validateCredentials(_model: string, credentials: StepfunCredentials) {
    if (!credentials.api_key) throw new Error('StepFun API key is required')
  }
  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(copilotModel.copilot.modelProvider.credentials, options?.modelProperties) as StepfunCredentials
    return new StepAudioAsrChatModel({ apiKey: credentials.api_key, model: copilotModel.model })
  }
}

export class StepAudioAsrChatModel extends BaseChatModel {
  constructor(private readonly fields: BaseChatModelParams & { apiKey: string; model: string }) {
    super(fields)
    if (!fields.apiKey) throw new Error('StepFun API key is required')
    if (fields.model !== 'stepaudio-3-asr-max') throw new Error('Unsupported StepFun ASR model')
  }
  _llmType() { return 'stepfun-asr' }
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const audio = await readStepAudio(messages, options.signal)
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    signal.throwIfAborted()
    const response = await fetch(`${StepfunBaseUrl}/audio/asr/sse`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.fields.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ audio: { data: audio.data, input: { transcription: { model: this.fields.model, enable_itn: true }, format: { type: audio.format } } } })
    })
    if (!response.ok) throw new Error(`StepFun ASR request failed: HTTP ${response.status}`)
    if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('StepFun ASR expected an SSE response')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let final: Extract<z.infer<typeof eventSchema>, { type?: 'transcript.text.done' }> | undefined
    const consume = (frame: string) => {
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!data || data === '[DONE]') return
      const parsed = eventSchema.safeParse(JSON.parse(data))
      if (!parsed.success) throw new Error('StepFun ASR returned an invalid event')
      if (parsed.data.type === 'error') throw new Error('StepFun ASR returned an error event')
      if (parsed.data.type === 'transcript.text.done') final = parsed.data
    }
    try {
      while (true) {
        signal.throwIfAborted()
        const { value, done } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        // Normalize after accumulation so a CR/LF split across chunks remains a single newline.
        buffer = buffer.replace(/\r\n/g, '\n')
        if (buffer.length > 1024 * 1024) throw new Error('StepFun ASR event exceeds 1 MiB')
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) { consume(buffer.slice(0, end)); buffer = buffer.slice(end + 2) }
        if (done) { if (buffer.trim()) consume(buffer); break }
      }
    } finally { await reader.cancel(); reader.releaseLock() }
    if (!final) throw new Error('StepFun ASR ended without a final transcript')
    const { text, usage } = final
    return { generations: [{ text, message: new AIMessage({ content: text, ...(usage ? { response_metadata: { usage } } : {}) }) }] }
  }
}
