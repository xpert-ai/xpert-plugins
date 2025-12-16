import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_LLM_MODELS, toCredentialKwargs } from '../types.js';

@Injectable()
export class MiniMaxLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  protected createChatModel(params: object) {
    return new ChatOAICompatReasoningModel(params);
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;
    const modelCredentials = mergeCredentials(modelProvider.credentials, options?.modelProperties) as MiniMaxModelCredentials;
    const model = copilotModel.model;

    const params = toCredentialKwargs(modelCredentials, model);

    return this.createChatModel({
      ...params,
      model,
      streaming: copilotModel.options?.['streaming'] ?? true,
      temperature: copilotModel.options?.['temperature'] ?? 0,
      maxTokens: copilotModel.options?.['max_tokens'],
      verbose: options?.verbose
    });
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_LLM_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`LLM model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
  }

  static getSupportedModels() {
    return SUPPORTED_LLM_MODELS;
  }
}