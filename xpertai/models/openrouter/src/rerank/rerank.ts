import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  getErrorMessage,
  IRerank,
  mergeCredentials,
  OpenAICompatibleReranker,
  RerankModel,
  TChatModelOptions,
  TModelProperties
} from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { normalizeOpenRouterBaseUrl, OpenRouterModelCredentials } from '../types.js'

@Injectable()
export class OpenRouterRerankModel extends RerankModel {
  constructor(modelProvider: OpenRouterProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: OpenRouterModelCredentials): Promise<void> {
    const reranker = this.createReranker(credentials)
    try {
      await reranker.rerank(
        [{ pageContent: 'OpenRouter provides model APIs.' }] as any,
        'What does OpenRouter provide?',
        { model, topN: 1 }
      )
    } catch (error) {
      throw new Error(`Reranker credentials validation failed: ${getErrorMessage(error)}`)
    }
  }

  override async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as OpenRouterModelCredentials
    return this.createReranker(credentials)
  }

  private createReranker(credentials: OpenRouterModelCredentials): OpenAICompatibleReranker {
    const values = (credentials ?? {}) as OpenRouterModelCredentials & TModelProperties
    return new OpenAICompatibleReranker({
      endpointUrl: normalizeOpenRouterBaseUrl(values.endpoint_url),
      apiKey: values.api_key ?? '',
      endpointModelName: values.endpoint_model_name
    })
  }
}
