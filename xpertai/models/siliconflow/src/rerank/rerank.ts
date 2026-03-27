import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  getErrorMessage,
  IRerank,
  mergeCredentials,
  OpenAICompatibleReranker,
  RerankModel,
  TChatModelOptions,
  TModelProperties,
} from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { getBaseUrlFromCredentials } from '../types.js'

@Injectable()
export class SiliconflowRerankModel extends RerankModel {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.RERANK)
  }

  override async validateCredentials(model: string, credentials: Record<string, any>) {
    const merged = credentials ?? ({} as TModelProperties)
    const reranker = new OpenAICompatibleReranker({
      endpointUrl: getBaseUrlFromCredentials(merged as any),
      apiKey: merged.api_key,
      endpointModelName: merged.endpoint_model_name,
    })
    try {
      await reranker.rerank([], 'test', { model })
    } catch (error) {
      throw new Error(`Reranker credentials validation failed: ${getErrorMessage(error)}`)
    }
  }

  override async getReranker(copilotModel: ICopilotModel, options?: TChatModelOptions): Promise<IRerank> {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as TModelProperties
    return new OpenAICompatibleReranker({
      endpointUrl: getBaseUrlFromCredentials(credentials as any),
      apiKey: credentials.api_key,
      endpointModelName: credentials.endpoint_model_name,
    })
  }
}
