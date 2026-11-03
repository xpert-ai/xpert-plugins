import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { TextToSpeechModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { StepfunProviderStrategy } from '../provider.strategy.js'
import { StepfunBaseUrl, type StepfunCredentials } from '../types.js'

@Injectable()
export class StepfunTTSModel extends TextToSpeechModel {
  constructor(provider: StepfunProviderStrategy) { super(provider, AiModelTypeEnum.TTS) }
  async validateCredentials(_model: string, credentials: StepfunCredentials) {
    if (!credentials.api_key) throw new Error('StepFun API key is required')
  }
  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(copilotModel.copilot.modelProvider.credentials, options?.modelProperties) as StepfunCredentials
    return new StepAudioTTSChatModel({ apiKey: credentials.api_key, model: copilotModel.model, voice: copilotModel.options?.['voice'], speed: copilotModel.options?.['speed'] })
  }
}

export class StepAudioTTSChatModel extends BaseChatModel {
  constructor(private readonly fields: BaseChatModelParams & { apiKey: string; model: string; voice?: string; speed?: number }) {
    super(fields)
    if (!fields.apiKey) throw new Error('StepFun API key is required')
    if (fields.model !== 'stepaudio-3-tts') throw new Error('Unsupported StepFun TTS model')
    if (fields.speed !== undefined && (!Number.isFinite(fields.speed) || fields.speed < .5 || fields.speed > 2)) throw new Error('StepAudio speed must be between 0.5 and 2')
  }
  _llmType() { return 'stepfun-tts' }
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const text = messages.at(-1)?.content
    if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 1000) throw new Error('StepAudio TTS requires 1 to 1000 text characters')
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    signal.throwIfAborted()
    const response = await fetch(`${StepfunBaseUrl}/audio/speech`, {
      method: 'POST', signal,
      headers: { Authorization: `Bearer ${this.fields.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.fields.model, input: text, voice: this.fields.voice ?? 'cixingnansheng', speed: this.fields.speed ?? 1, response_format: 'mp3', stream_format: 'audio' })
    })
    if (!response.ok) throw new Error(`StepFun TTS request failed: HTTP ${response.status}`)
    const mimeType = response.headers.get('content-type')?.split(';')[0]
    if (mimeType !== 'audio/mpeg' && mimeType !== 'audio/mp3' && mimeType !== 'application/octet-stream') throw new Error('StepFun TTS returned a non-audio response')
    const bytes = Buffer.from(await response.arrayBuffer())
    signal.throwIfAborted()
    if (!bytes.length) throw new Error('StepFun TTS returned empty audio')
    return { generations: [{ text: '', message: new AIMessage({ content: [{ type: 'audio', data: bytes.toString('base64'), mime_type: 'audio/mpeg' }] }) }] }
  }
}
