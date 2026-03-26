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
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, TongyiCredentials, TongyiTextEmbeddingModelOptions } from '../types.js'

@Injectable()
export class TongyiTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(override readonly modelProvider: TongyiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
    const merged = mergeCredentials(
      copilotModel.copilot.modelProvider.credentials,
      options?.modelProperties
    ) as TongyiCredentials & TongyiTextEmbeddingModelOptions

    return new OpenAIEmbeddings({
      ...toCredentialKwargs(merged),
      model: copilotModel.model || copilotModel.copilot.copilotModel?.model,
      batchSize: Number(copilotModel.options?.['max_chunks'] ?? merged?.max_chunks ?? 10),
    })
  }

  async validateCredentials(model: string, credentials: TongyiCredentials): Promise<void> {
    try {
      const embeddings = new OpenAIEmbeddings({
        ...toCredentialKwargs(credentials),
        model,
      })
      await embeddings.embedQuery('ping')
    } catch (ex) {
      throw new CredentialsValidateFailedError(getErrorMessage(ex))
    }
  }
}
