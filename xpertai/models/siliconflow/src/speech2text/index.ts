import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  mergeCredentials,
  Speech2TextChatModel,
  SpeechToTextModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class SiliconflowSpeech2TextModel extends SpeechToTextModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
  }

  validateCredentials(model: string, credentials: Record<string, any>): Promise<void> {
    return Promise.resolve()
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    )

    return new Speech2TextChatModel({
      apiKey: credentials?.api_key,
      model: copilotModel.model,
    })
  }
}
