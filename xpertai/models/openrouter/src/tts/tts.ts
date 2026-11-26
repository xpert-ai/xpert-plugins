import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { TextToSpeechModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { normalizeOpenRouterBaseUrl, OpenRouterDefaultHeaders, type OpenRouterCredentials } from '../types.js'

@Injectable()
export class OpenRouterTTSModel extends TextToSpeechModel {
  constructor(provider: OpenRouterProviderStrategy) { super(provider, AiModelTypeEnum.TTS) }
  async validateCredentials(_model: string, credentials: OpenRouterCredentials) {
    if (!credentials.api_key) throw new Error('OpenRouter API key is required')
  }
  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(copilotModel.copilot.modelProvider.credentials, options?.modelProperties) as OpenRouterCredentials
    const schema = this.getModelSchema(copilotModel.model)
    const voice = copilotModel.options?.['voice'] ?? schema?.model_properties?.['default_voice']
    return new OpenRouterTTSChatModel({
      apiKey: credentials.api_key, model: copilotModel.model, baseUrl: normalizeOpenRouterBaseUrl(credentials.endpoint_url), voice
    })
  }
}

export class OpenRouterTTSChatModel extends BaseChatModel {
  constructor(private readonly fields: BaseChatModelParams & { apiKey: string; model: string; baseUrl: string; voice?: string }) {
    super(fields)
    if (!fields.apiKey) throw new Error('OpenRouter API key is required')
  }
  _llmType() { return 'openrouter-tts' }
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const text = messages.at(-1)?.content
    if (typeof text !== 'string' || !text.trim()) throw new Error('OpenRouter TTS requires nonempty text')
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    signal.throwIfAborted()
    const response = await fetch(`${this.fields.baseUrl}/audio/speech`, {
      method: 'POST', signal,
      headers: { ...OpenRouterDefaultHeaders, Authorization: `Bearer ${this.fields.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.fields.model, input: text, voice: this.fields.voice, response_format: 'mp3' })
    })
    if (!response.ok) throw new Error(`OpenRouter TTS request failed: HTTP ${response.status}`)
    const mimeType = response.headers.get('content-type')?.split(';')[0]
    if (mimeType !== 'audio/mpeg' && mimeType !== 'audio/mp3' && mimeType !== 'application/octet-stream') throw new Error('OpenRouter TTS returned a non-audio response')
    const bytes = Buffer.from(await response.arrayBuffer())
    signal.throwIfAborted()
    if (!bytes.length) throw new Error('OpenRouter TTS returned empty audio')
    return { generations: [{ text: '', message: new AIMessage({ content: [{ type: 'audio', data: bytes.toString('base64'), mime_type: 'audio/mpeg' }] }) }] }
  }
}
