import type { ChatOpenAIFields } from '@langchain/openai';
import { AiModelTypeEnum, type ICopilotModel } from '@xpert-ai/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  type TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import type { MimoProviderStrategy } from '../provider.strategy.js';
import {
  type MimoModelCredentials,
  toCredentialKwargs,
} from '../types.js';
import { buildMimoModelKwargs } from './model-kwargs.js';

@Injectable()
export class MimoLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(MimoLargeLanguageModel.name);

  constructor(modelProvider: MimoProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: MimoModelCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model);
      const chatModel = new ChatOAICompatReasoningModel({
        ...params,
        temperature: 0,
        maxTokens: 5,
        modelKwargs: buildMimoModelKwargs(credentials),
      });
      await chatModel.invoke([{ role: 'human', content: 'Hi' }]);
    } catch (error) {
      throw new CredentialsValidateFailedError(getErrorMessage(error));
    }
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { copilot } = copilotModel;
    const credentials = mergeCredentials(
      copilot.modelProvider.credentials,
      options?.modelProperties
    ) as MimoModelCredentials;
    const modelOptions = copilotModel.options ?? {};
    const runtimeCredentials: MimoModelCredentials = {
      ...credentials,
      thinking:
        (modelOptions['thinking'] as MimoModelCredentials['thinking']) ??
        credentials.thinking,
      response_format:
        (modelOptions['response_format'] as MimoModelCredentials['response_format']) ??
        credentials.response_format,
    };
    const params = toCredentialKwargs(runtimeCredentials, copilotModel.model);
    const fields: ChatOpenAIFields = {
      ...params,
      streaming: modelOptions['streaming'] ?? true,
      streamUsage: false,
      temperature: modelOptions['temperature'] ?? runtimeCredentials.temperature,
      topP: modelOptions['top_p'] ?? runtimeCredentials.top_p,
      modelKwargs: buildMimoModelKwargs(runtimeCredentials),
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          params.model,
          runtimeCredentials,
          options?.handleLLMTokens
        ),
        this.createHandleLLMErrorCallbacks(
          { ...params, apiKey: '[REDACTED]' },
          this.#logger
        ),
      ],
    };
    return new ChatOAICompatReasoningModel(fields);
  }
}
