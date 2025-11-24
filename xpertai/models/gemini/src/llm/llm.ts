import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { GeminiProviderStrategy } from '../provider.strategy.js';
import { GeminiModelCredentials, toCredentialKwargs } from '../types.js';

@Injectable()
export class GeminiLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(GeminiLargeLanguageModel.name);

  constructor(modelProvider: GeminiProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(
    model: string,
    credentials: GeminiModelCredentials
  ): Promise<void> {
    try {
      const chatModel = new ChatGoogleGenerativeAI({
        ...toCredentialKwargs(credentials),
        model: model,
        temperature: 0,
        maxOutputTokens: 5,
      });
      await chatModel.invoke('Hello, how are you?');
    } catch (err) {
      console.error(err);
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
    ) as GeminiModelCredentials;
    const params = toCredentialKwargs(modelCredentials);

    const fields = {
      ...params,
      model: copilotModel.model,
      streaming: true,
      maxRetries: modelCredentials?.maxRetries,
    };
    return new ChatGoogleGenerativeAI({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          copilotModel.model,
          modelCredentials,
          handleLLMTokens
        ),
        this.createHandleLLMErrorCallbacks(fields, this.#logger),
      ],
    }) as any;
  }
}
