import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  getErrorMessage,
  IRerank,
  OpenAICompatibleReranker,
  RerankModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk'
import { translate } from '../i18n.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { XinferenceModelCredentials } from '../types.js'

@Injectable()
export class XinferenceRerankModel extends RerankModel {
  constructor(modelProvider: XinferenceProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: XinferenceModelCredentials) {
    const _credentials = credentials ?? {} as XinferenceModelCredentials
    const reranker = new OpenAICompatibleReranker({
      endpointUrl: _credentials.server_url,
      apiKey: _credentials.api_key,
      endpointModelName: _credentials.model_uid
    })
    try {
      await reranker.rerank([], 'test', { model })
    } catch (error) {
      throw new Error(`Reranker credentials validation failed: ${getErrorMessage(error)}`)
    }
  }

  override async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = options?.modelProperties as XinferenceModelCredentials
    if (!credentials) {
      throw new Error(
        translate('Error.ModelCredentialsMissing', {model: copilotModel.model})
      )
    }
    
    return new OpenAICompatibleReranker({
      endpointUrl: credentials.server_url,
      apiKey: credentials.api_key,
      endpointModelName: credentials.model_uid || copilotModel.model
    })
  }
}
