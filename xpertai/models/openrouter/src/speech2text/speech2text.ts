import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { Injectable } from '@nestjs/common'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { SpeechToTextModel, mergeCredentials, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { normalizeOpenRouterBaseUrl, type OpenRouterCredentials } from '../types.js'
import { OpenRouterTranscriptionModel } from './transcription.js'

@Injectable()
export class OpenRouterSpeech2TextModel extends SpeechToTextModel {
  constructor(provider: OpenRouterProviderStrategy) { super(provider, AiModelTypeEnum.SPEECH2TEXT) }

  async validateCredentials(_model: string, credentials: OpenRouterCredentials) {
    if (!credentials.api_key) throw new Error('OpenRouter API key is required')
  }

  override getChatModel(model: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(model.copilot.modelProvider.credentials, options?.modelProperties) as OpenRouterCredentials
    return new OpenRouterTranscriptionModel({
      model: model.model, apiKey: credentials.api_key, baseUrl: normalizeOpenRouterBaseUrl(credentials.endpoint_url)
    })
  }
}
