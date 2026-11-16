import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { TextToSpeechModel, TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { getTongyiHttpBaseUrl, joinTongyiApiUrl, TongyiCredentials, TongyiDefaultHttpBaseUrl } from '../types.js'

@Injectable()
export class TongyiTTSModel extends TextToSpeechModel {
  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TTS)
  }

  override validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    throw new Error('Method not implemented.')
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const parameters = copilotModel.options || options?.modelProperties
    const credentials = copilotModel.copilot.modelProvider.credentials as TongyiCredentials
    return new TTSChatModel({
      apiKey: credentials.dashscope_api_key,
      model: copilotModel.model,
      voice: parameters?.voice,
      baseUrl: getTongyiHttpBaseUrl(credentials),
      runtime: options
    })
  }
}

export interface ChatTongyiTTSInput extends BaseChatModelParams {
  apiKey?: string
  model: string
  voice: string
  baseUrl?: string
  runtime?: TChatModelOptions
}

export class TTSChatModel extends BaseChatModel {
  _llmType(): string {
    return 'tongyi-tts'
  }

  protected apiKey: string

  constructor(private fields?: Partial<ChatTongyiTTSInput>) {
    const apiKey = fields?.apiKey
    if (!apiKey) {
      throw new Error('Tongyi API key is required for TTS.')
    }
    super({ ...fields })
    this.apiKey = apiKey
  }

  override async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    throw new Error('Use streaming mode for Tongyi TTS.')
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const { signal } = options
    const model = this.fields?.model || 'qwen-tts'
    const voice = this.fields?.voice
    const baseUrl = this.fields?.baseUrl || TongyiDefaultHttpBaseUrl

    const url = joinTongyiApiUrl(baseUrl, '/services/aigc/multimodal-generation/generation')
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable'
    }

    const text = messages[0]?.content
    if (typeof text !== 'string' || !text.trim() || Array.from(text).length > 600)
      throw new Error('Tongyi TTS requires 1–600 text characters.')
    const recordedAt = new Date().toISOString(),
      requestId = randomUUID()
    const pricingSnapshot = await this.fields?.runtime?.resolveUsagePricingSnapshot?.({
      model,
      operation: AiModelTypeEnum.TTS,
      modality: 'audio',
      startedAt: recordedAt
    })
    const data = {
      model,
      input: { text, voice }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Tongyi TTS request failed: ${response.status} ${errorText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Failed to get response reader')

    const decoder = new TextDecoder()
    let buffer = ''
    let completed = false

    try {
      while (true) {
        const { done, value } = await reader.read()
        buffer += done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
        if (buffer.length > 4 * 1024 * 1024) throw new Error('Tongyi TTS event exceeds the response limit.')

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data:')) continue
          const jsonStr = trimmed.slice(5).trim()
          if (!jsonStr || jsonStr === '[DONE]') continue

          let message: any
          try {
            message = JSON.parse(jsonStr)
          } catch {
            throw new Error('Tongyi TTS returned invalid event JSON.')
          }
          if (message.code || message.status_code >= 400) throw new Error('Tongyi TTS synthesis failed.')
          if (message.output) {
            if (message.output.finish_reason === 'stop') {
              const characters = message.usage?.characters
              if (this.fields?.runtime?.handleModelUsage) {
                const metrics =
                  Number.isSafeInteger(characters) && characters >= 0
                    ? [
                        {
                          unit: 'character' as const,
                          component: 'input' as const,
                          quantity: characters,
                          authority: 'provider' as const
                        }
                      ]
                    : (['input', 'output'] as const).flatMap((component) => {
                        const quantity = message.usage?.[component + '_tokens']
                        return Number.isSafeInteger(quantity) && quantity >= 0
                          ? [{ unit: 'token' as const, component, quantity, authority: 'provider' as const }]
                          : []
                      })
                if (!metrics.length) throw new Error('Tongyi TTS final usage is unavailable.')
                // A ledger error must propagate, never trigger a hidden synthesis retry.
                await this.fields.runtime.handleModelUsage({
                  requestId,
                  model,
                  modelType: AiModelTypeEnum.TTS,
                  operation: AiModelTypeEnum.TTS,
                  modality: 'audio',
                  recordedAt,
                  pricingSnapshot,
                  metrics
                })
              }
              completed = true
            }
            yield new ChatGenerationChunk({
              text: '',
              message: new AIMessageChunk({
                id: message.output.id,
                content: [
                  {
                    ...message.output.audio,
                    type: 'audio',
                    format: 'pcm_s16le',
                    sampleRate: 24000,
                    channels: 1
                  }
                ],
                // Character usage is reported through the non-LLM ledger above.
                response_metadata: { requestId, providerRequestId: message.request_id }
              })
            })

            if (message.output.finish_reason === 'stop') return
          }
        }
        if (done) break
      }
      if (!completed) throw new Error('Tongyi TTS stream ended before synthesis completed.')
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
  }
}
