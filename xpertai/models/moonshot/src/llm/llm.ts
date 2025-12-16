import { ChatOpenAI } from '@langchain/openai';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { MoonshotProviderStrategy } from '../provider.strategy.js';
import { MoonshotModelCredentials, toCredentialKwargs } from '../types.js';

@Injectable()
export class MoonshotLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(MoonshotLargeLanguageModel.name);

  constructor(modelProvider: MoonshotProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: MoonshotModelCredentials
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
          content: '你好',
        },
      ]);
    } catch (err) {
      this.#logger.error('Moonshot credentials validation failed', err);
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
    ) as MoonshotModelCredentials;
    const params = toCredentialKwargs(modelCredentials, copilotModel.model);

    const fields = {
      ...params,
      streaming: copilotModel.options?.['streaming'] ?? true,
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

