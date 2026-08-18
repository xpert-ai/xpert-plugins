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
import { LongcatProviderStrategy } from '../provider.strategy.js';
import {
  type LongcatModelCredentials,
  toCredentialKwargs,
} from '../types.js';
import { buildLongcatModelKwargs } from './model-kwargs.js';

@Injectable()
export class LongcatLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(LongcatLargeLanguageModel.name);

  constructor(modelProvider: LongcatProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: LongcatModelCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model);
      const chatModel = new ChatOAICompatReasoningModel({
        ...params,
        temperature: 0,
        maxTokens: 5,
        modelKwargs: buildLongcatModelKwargs(credentials),
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
    ) as LongcatModelCredentials;
    const modelOptions = copilotModel.options ?? {};
    const runtimeCredentials: LongcatModelCredentials = {
      ...credentials,
      enable_thinking:
        (modelOptions['enable_thinking'] as LongcatModelCredentials['enable_thinking']) ??
        credentials.enable_thinking ??
        true,
    };
    const params = toCredentialKwargs(runtimeCredentials, copilotModel.model);
    const fields: ChatOpenAIFields = {
      ...params,
      streaming: modelOptions['streaming'] ?? true,
      streamUsage: false,
      temperature: modelOptions['temperature'] ?? runtimeCredentials.temperature,
      topP: modelOptions['top_p'] ?? runtimeCredentials.top_p,
      maxTokens: modelOptions['max_tokens'] ?? runtimeCredentials.max_tokens,
      modelKwargs: buildLongcatModelKwargs(runtimeCredentials),
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
