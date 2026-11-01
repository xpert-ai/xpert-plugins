import { randomUUID } from 'node:crypto'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, AIMessageChunk, type BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, type ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { TextToSpeechModel, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { synthesize, ttsCredentialsSchema, ttsModel, ttsParametersSchema, validateTtsConnection, type TtsCredentials, type SocketFactory } from './protocol.js'

function validateModel(model: string) {
  if (model !== ttsModel) throw new Error('Xirang TTS currently supports the supernaturalrt service')
}

@Injectable()
export class XirangTextToSpeechModel extends TextToSpeechModel {
  constructor(override readonly modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TTS)
  }

  override async validateCredentials(model: string, credentials: TtsCredentials): Promise<void> {
    validateModel(model)
    await validateTtsConnection(ttsCredentialsSchema.parse(credentials))
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    validateModel(copilotModel.model)
    const properties = { ...copilotModel.copilot?.modelProvider?.credentials, ...options?.modelProperties }
    return new XirangTtsChatModel(ttsCredentialsSchema.parse(properties), ttsParametersSchema.parse({
      ...properties, ...copilotModel.options
    }))
  }
}

export class XirangTtsChatModel extends BaseChatModel {
  constructor(
    private readonly credentials: TtsCredentials,
    private readonly parameters: z.infer<typeof ttsParametersSchema> = {},
    private readonly createSocket?: SocketFactory
  ) { super({}) }

  _llmType() { return 'xirang-tts' }

  override async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const audio: Buffer[] = []
    for await (const chunk of this.audio(messages, options)) audio.push(Buffer.from(chunk, 'base64'))
    const content = [{ type: 'audio', data: Buffer.concat(audio).toString('base64'), format: 'pcm', sample_rate: 24000 }]
    return { generations: [{ text: '', message: new AIMessage({ content }) }] }
  }

  override async *_streamResponseChunks(messages: BaseMessage[], options: this['ParsedCallOptions']): AsyncGenerator<ChatGenerationChunk> {
    const id = randomUUID()
    for await (const data of this.audio(messages, options)) {
      yield new ChatGenerationChunk({ text: '', message: new AIMessageChunk({
        id, content: [{ type: 'audio', data, format: 'pcm', sample_rate: 24000 }]
      }) })
    }
  }

  private async *audio(messages: BaseMessage[], options: this['ParsedCallOptions']): AsyncGenerator<string> {
    const text = z.string().min(1).max(10_000).parse(messages.at(-1)?.content)
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(120_000)])
    // The service silently truncates after 500 characters; send consecutive requests instead.
    const characters = Array.from(text)
    for (let offset = 0; offset < characters.length; offset += 500) {
      yield* synthesize(this.credentials, characters.slice(offset, offset + 500).join(''), this.parameters, signal, this.createSocket)
    }
  }
}
