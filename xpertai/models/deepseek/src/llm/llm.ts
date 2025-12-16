import { ChatOpenAI } from '@langchain/openai';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { DeepSeekProviderStrategy } from '../provider.strategy.js';
import { DeepSeekModelCredentials, DeepSeekCredentials, toCredentialKwargs } from '../types.js';

@Injectable()
export class DeepSeekLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(DeepSeekLargeLanguageModel.name);

  constructor(modelProvider: DeepSeekProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: DeepSeekCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model);
      const chatModel = new ChatOpenAI({
        ...params,
        temperature: 0,
        maxTokens: 10,
      });
      await chatModel.invoke([
        {
          role: 'human',
          content: 'Hello',
        },
      ]);
    } catch (err) {
      this.#logger.error('DeepSeek credentials validation failed', err);
      throw new CredentialsValidateFailedError(getErrorMessage(err));
    }
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { handleLLMTokens } = options ?? {};
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;

    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options?.modelProperties
    ) as DeepSeekModelCredentials;
    const params = toCredentialKwargs(modelCredentials, copilotModel.model);

    const fields = {
      ...params,
      streaming: true,
      streamUsage: false,
      verbose: options?.verbose,
    };

    return new ChatOAICompatReasoningModel({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          params.model,
          modelCredentials,
          handleLLMTokens
        ),
        this.createHandleLLMErrorCallbacks(fields, this.#logger),
      ],
    });
  }
}
