import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessageChunk, BaseMessage } from '@langchain/core/messages'
import { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { mergeCredentials, TChatModelOptions, TextToSpeechModel } from '@xpert-ai/plugin-sdk'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { getDashscopeApiBase, TongyiCredentials } from '../types.js'
import { createSSEGenerator } from './sse.js'

@Injectable()
export class TongyiTTSModel extends TextToSpeechModel {
  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TTS)
  }

  override async validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    return
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as TongyiCredentials
    const parameters = copilotModel.options || options?.modelProperties

    return new TTSChatModel({
      apiKey: credentials.dashscope_api_key,
      baseUrl: getDashscopeApiBase(credentials),
      model: copilotModel.model,
      voice: parameters?.voice as string,
    })
  }
}

export interface ChatTongyiTTSInput extends BaseChatModelParams {
  apiKey?: string
  baseUrl: string
  model: string
  voice?: string
}

export class TTSChatModel extends BaseChatModel {
  _llmType(): string {
    return 'tongyi-tts'
  }

  protected apiKey: string

  constructor(private fields?: Partial<ChatTongyiTTSInput>) {
    if (!fields?.apiKey) {
      throw new Error('Tongyi API key not found.')
    }
    super({ ...fields })
    this.apiKey = fields.apiKey
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let lastChunk: ChatGenerationChunk | null = null
    for await (const chunk of this._streamResponseChunks(messages, options, runManager)) {
      lastChunk = chunk
    }

    return {
      generations: lastChunk
        ? [
            {
              text: lastChunk.text,
              message: lastChunk.message as any,
            },
          ]
        : [],
    }
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    const url = `${(this.fields?.baseUrl || 'https://dashscope.aliyuncs.com/api/v1').replace(/\/$/, '')}/services/aigc/multimodal-generation/generation`
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable',
    }

    const generator = createSSEGenerator({
      url,
      fetchOptionsBuilder: () => ({
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.fields?.model || 'tts-1',
          input: {
            text: messages[0].content as string,
            voice: this.fields?.voice,
          },
        }),
      }),
      completionCondition: (data) => data.includes('stop'),
      errorCondition: () => false,
      parseData: (data) => data,
      signal: options.signal,
    })

    for await (const event of generator) {
      if (event.type === 'progress') {
        yield convertTTSDeltaToBaseMessageChunk(event.output)
      } else if (event.type === 'complete' && event.result) {
        yield convertTTSDeltaToBaseMessageChunk(event.result)
        break
      } else if (event.type === 'error') {
        throw event.error
      }
    }
  }
}

function convertTTSDeltaToBaseMessageChunk(chunk: string) {
  const message = JSON.parse(chunk)
  return new ChatGenerationChunk({
    text: '',
    message: new AIMessageChunk({
      id: message.output.id,
      content: [
        {
          ...message.output.audio,
          type: 'audio',
        },
      ],
      usage_metadata: message.usage,
    }),
  })
}
