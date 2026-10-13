import { OpenAIEmbeddings } from '@langchain/openai'
import { AiModelTypeEnum, type ICopilotModel, readModelConfiguration } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CredentialsValidateFailedError, getErrorMessage, type TChatModelOptions, TextEmbeddingModelManager } from '@xpert-ai/plugin-sdk'
import { XirangProviderStrategy } from '../provider.strategy.js'
import {
  toCredentialKwargs,
  type XirangModelCredentials,
  type XirangPredefinedModelConfig
} from '../types.js'

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
    const modelConfig = this.getModelSchema(copilotModel.model)?.modelConfig as XirangPredefinedModelConfig | undefined
    const configuration = readModelConfiguration(credentials)
    const embeddingConfiguration = configuration?.modelType === AiModelTypeEnum.TEXT_EMBEDDING ? configuration : undefined
    return new OpenAIEmbeddings({
      ...toCredentialKwargs(credentials, copilotModel.model, modelConfig),
      batchSize: embeddingConfiguration?.batchSize ?? 512,
      dimensions: embeddingConfiguration?.dimensions,
      maxConcurrency: embeddingConfiguration?.maxConcurrency
    })
  }

  async validateCredentials(model: string, credentials: XirangModelCredentials): Promise<void> {
    try {
      const modelConfig = this.getModelSchema(model)?.modelConfig as XirangPredefinedModelConfig | undefined
      await new OpenAIEmbeddings({ ...toCredentialKwargs(credentials, model, modelConfig), batchSize: 1 }).embedQuery(
        'ping'
      )
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error))
    }
  }
}
