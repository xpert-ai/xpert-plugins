import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  mergeCredentials,
  TChatModelOptions,
  TextEmbeddingModelManager
} from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import { OpenRouterModelCredentials, toCredentialKwargs } from '../types.js'

@Injectable()
export class OpenRouterTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(modelProvider: OpenRouterProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
    const credentials = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as OpenRouterModelCredentials
    const params = toCredentialKwargs(credentials, copilotModel.model)

    return new OpenAIEmbeddings(params)
  }

  async validateCredentials(model: string, credentials: OpenRouterModelCredentials): Promise<void> {
    try {
      const embeddings = new OpenAIEmbeddings(toCredentialKwargs(credentials, model))
      await embeddings.embedQuery('ping')
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    }
  }
}
