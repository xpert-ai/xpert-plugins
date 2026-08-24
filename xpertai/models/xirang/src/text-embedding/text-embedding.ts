import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, type TChatModelOptions, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, type XirangModelCredentials } from '../types.js'

@Injectable()
export class XirangTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING)
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions): OpenAIEmbeddings {
    const credentials = {
      ...(copilotModel.copilot?.modelProvider?.credentials ?? {}),
      ...(options?.modelProperties ?? {})
    } as XirangModelCredentials
    return new OpenAIEmbeddings({
      ...toCredentialKwargs(credentials, copilotModel.model),
      batchSize: 512
    })
  }

  async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    try {
      await new OpenAIEmbeddings({ ...toCredentialKwargs(credentials, model), batchSize: 1 }).embedQuery('ping')
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    }
  }
}
