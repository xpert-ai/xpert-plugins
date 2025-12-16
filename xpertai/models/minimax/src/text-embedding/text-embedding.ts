import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { OpenAIEmbeddings } from '@langchain/openai';
import {
  CredentialsValidateFailedError,
  mergeCredentials,
  TextEmbeddingModelManager,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_EMBEDDING_MODELS, toCredentialKwargs } from '../types.js';

@Injectable()
export class MiniMaxTextEmbeddingModel extends TextEmbeddingModelManager {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.TEXT_EMBEDDING);
  }

  getEmbeddingInstance(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;
    const modelCredentials = mergeCredentials(modelProvider.credentials, options?.modelProperties) as MiniMaxModelCredentials;
    const model = copilotModel.model ?? 'embo-01';
    const params = toCredentialKwargs(modelCredentials, model);

    return new OpenAIEmbeddings({
      ...params,
      model,
      verbose: options?.verbose
    });
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_EMBEDDING_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`Embedding model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
  }

  static getSupportedModels() {
    return SUPPORTED_EMBEDDING_MODELS;
  }
}