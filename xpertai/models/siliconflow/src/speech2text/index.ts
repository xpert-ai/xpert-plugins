import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  mergeCredentials,
  SpeechToTextModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { getBaseUrlFromCredentials, type SiliconflowModelCredentials } from '../types.js'
import { SiliconflowTranscriptionModel } from './transcription.js'

@Injectable()
export class SiliconflowSpeech2TextModel extends SpeechToTextModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
  }

  async validateCredentials(_model: string, credentials: SiliconflowModelCredentials): Promise<void> {
    if (!credentials.api_key) throw new Error('SiliconFlow API key is required')
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as SiliconflowModelCredentials

    return new SiliconflowTranscriptionModel({
      apiKey: credentials?.api_key,
      baseUrl: getBaseUrlFromCredentials(credentials),
      model: credentials.endpoint_model_name || copilotModel.model,
    })
  }
}
