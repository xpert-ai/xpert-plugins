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
import type { StepfunProviderStrategy } from '../provider.strategy.js';
import {
  type StepfunModelCredentials,
  toCredentialKwargs,
} from '../types.js';
import { buildStepfunModelKwargs } from './model-kwargs.js';

@Injectable()
export class StepfunLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(StepfunLargeLanguageModel.name);

  constructor(modelProvider: StepfunProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: StepfunModelCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model);
      const chatModel = new ChatOAICompatReasoningModel({
        ...params,
        temperature: 0,
        maxTokens: 5,
        modelKwargs: buildStepfunModelKwargs(credentials),
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
    ) as StepfunModelCredentials;
    const modelOptions = copilotModel.options ?? {};
    const runtimeCredentials: StepfunModelCredentials = {
      ...credentials,
      reasoning_effort:
        (modelOptions['reasoning_effort'] as StepfunModelCredentials['reasoning_effort']) ??
        credentials.reasoning_effort,
      response_format:
        (modelOptions['response_format'] as StepfunModelCredentials['response_format']) ??
        credentials.response_format,
      json_schema:
        (modelOptions['json_schema'] as StepfunModelCredentials['json_schema']) ??
        credentials.json_schema,
    };
    const params = toCredentialKwargs(runtimeCredentials, copilotModel.model);
    const fields: ChatOpenAIFields = {
      ...params,
      streaming: modelOptions['streaming'] ?? true,
      streamUsage: false,
      temperature: modelOptions['temperature'] ?? runtimeCredentials.temperature,
      topP: modelOptions['top_p'] ?? runtimeCredentials.top_p,
      maxTokens: modelOptions['max_tokens'] ?? runtimeCredentials.max_tokens,
      modelKwargs: buildStepfunModelKwargs(runtimeCredentials),
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
