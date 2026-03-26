import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  mergeCredentials,
  TChatModelOptions,
  TextEmbeddingModelManager,
} from '@xpert-ai/plugin-sdk'
import { SiliconflowProviderStrategy } from '../provider.strategy.js'
import { SiliconflowModelCredentials, toCredentialKwargs } from '../types.js'

@Injectable()
export class SiliconflowTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(modelProvider: SiliconflowProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
    const params = toCredentialKwargs(
      mergeCredentials(
        copilotModel.copilot.modelProvider.credentials,
        options?.modelProperties
      ) as SiliconflowModelCredentials,
      copilotModel.model || copilotModel.copilot.copilotModel?.model
    )

    return new OpenAIEmbeddings({
      ...params,
    })
  }

  async validateCredentials(model: string, credentials: SiliconflowModelCredentials): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model)
      const embeddings = new OpenAIEmbeddings({
        ...params,
      })
      await embeddings.embedQuery('ping')
    } catch (ex) {
      throw new CredentialsValidateFailedError(getErrorMessage(ex))
    }
  }
}
