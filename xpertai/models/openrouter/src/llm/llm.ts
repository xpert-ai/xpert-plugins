import { ChatOpenAI, ChatOpenAIFields, ClientOptions } from '@langchain/openai';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { OpenRouterProviderStrategy } from '../provider.strategy.js';
import { OpenRouterModelCredentials, toCredentialKwargs } from '../types.js';

@Injectable()
export class OpenRouterLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(OpenRouterLargeLanguageModel.name);

  constructor(modelProvider: OpenRouterProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: OpenRouterModelCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model);
      const chatModel = new ChatOpenAI({
        ...params,
        temperature: 0,
        maxTokens: 5,
      });
      await chatModel.invoke([
        {
          role: 'human',
          content: `Hi`,
        },
      ]);
    } catch (err) {
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
    ) as OpenRouterModelCredentials;
    const params = toCredentialKwargs(modelCredentials, copilotModel.model);

    const fields = {
      ...params,
      streaming: true,
      streamUsage: false,
      verbose: options?.verbose,
    };
    return new ChatOpenAI({
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
