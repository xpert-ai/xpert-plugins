import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import { BaseChatModel, BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, BaseMessage } from '@langchain/core/messages'
import { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { mergeCredentials, TChatModelOptions, TextToSpeechModel } from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { getBaseUrlFromCredentials, SiliconflowModelCredentials } from '../types.js'

@Injectable()
export class SiliconflowTTSModel extends TextToSpeechModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TTS)
  }

  async validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    if (!credentials?.api_key) {
      throw new Error('API key is required')
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as SiliconflowModelCredentials

    return new SiliconflowTTSChatModel({
      apiKey: credentials.api_key,
      baseUrl: getBaseUrlFromCredentials(credentials),
      model: copilotModel.model,
      voice: copilotModel.options?.['voice'] as string | undefined,
    })
  }
}

interface SiliconflowTTSInput extends BaseChatModelParams {
  apiKey: string
  baseUrl: string
  model: string
  voice?: string
}

class SiliconflowTTSChatModel extends BaseChatModel {
  constructor(private readonly fields: SiliconflowTTSInput) {
    super(fields)
  }

  _llmType(): string {
    return 'siliconflow-tts'
  }

  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    const text = String(messages[messages.length - 1]?.content ?? '')
    const response = await fetch(`${this.fields.baseUrl.replace(/\/$/, '')}/audio/speech`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.fields.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.fields.model,
        input: text,
        voice: this.fields.voice,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      throw new Error(`SiliconFlow TTS request failed: ${response.status} ${response.statusText}`)
    }

    const audioBuffer = await response.arrayBuffer()
    const audioBase64 = Buffer.from(audioBuffer).toString('base64')

    return {
      generations: [
        {
          text: '',
          message: new AIMessage({
            content: [
              {
                type: 'audio',
                data: audioBase64,
                mime_type: response.headers.get('content-type') || 'audio/mpeg',
              },
            ] as any,
          }),
        },
      ],
    }
  }
}
