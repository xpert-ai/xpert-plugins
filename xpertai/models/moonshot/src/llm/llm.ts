import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts';
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
import { createMoonshotChatModel } from './moonshot-chat-model.js';
import { buildKimi31Options } from './kimi31-options.js';

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
      const chatModel = createMoonshotChatModel({
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
    const runtime = { ...options?.modelProperties, ...copilotModel.options };

    const fields = {
      ...params,
      ...(copilotModel.model === 'kimi-k3.1-pro' || copilotModel.model === 'kimi-k3.1-pro-highspeed'
        ? { modelKwargs: buildKimi31Options({
            max_completion_tokens: runtime['max_completion_tokens'],
            reasoning_effort: runtime['reasoning_effort'],
            response_format: runtime['response_format'],
            json_schema: runtime['json_schema'],
          }) }
        : {}),
      streaming: copilotModel.options?.['streaming'] ?? true,
      streamUsage: true,
      verbose: options?.verbose,
    };

    return createMoonshotChatModel({
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
