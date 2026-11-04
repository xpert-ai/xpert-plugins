import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts'
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

class SiliconflowVlEmbeddings extends OpenAIEmbeddings {
  protected override embeddingWithRetry(request: Parameters<OpenAIEmbeddings['embeddingWithRetry']>[0]) {
    return super.embeddingWithRetry({ ...request, encoding_format: 'float' })
  }
}

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

    return params.model === 'Qwen/Qwen3-VL-Embedding-8B'
      ? new SiliconflowVlEmbeddings({ ...params, batchSize: 1 })
      : new OpenAIEmbeddings(params)
  }

  async validateCredentials(model: string, credentials: SiliconflowModelCredentials): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model)
      const embeddings = params.model === 'Qwen/Qwen3-VL-Embedding-8B'
        ? new SiliconflowVlEmbeddings({ ...params, batchSize: 1 })
        : new OpenAIEmbeddings(params)
      await embeddings.embedQuery('ping')
    } catch (ex) {
      throw new CredentialsValidateFailedError(getErrorMessage(ex))
    }
  }
}
