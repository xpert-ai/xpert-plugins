import { ChatGoogleGenerativeAI, GoogleGenerativeAIChatInput } from '@langchain/google-genai';
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts';
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
import {
  buildGeminiInvocationParams,
  GeminiModelOptions,
  toGeminiFiniteNumber,
} from './model-parameters.js';

class GeminiChatGoogleGenerativeAI extends ChatGoogleGenerativeAI {
  readonly #modelOptions: GeminiModelOptions;

  constructor(fields: GoogleGenerativeAIChatInput, modelOptions: GeminiModelOptions) {
    super(fields);
    this.#modelOptions = modelOptions;
  }

  override invocationParams(options?: Parameters<ChatGoogleGenerativeAI['invocationParams']>[0]) {
    return buildGeminiInvocationParams(
      { ...super.invocationParams(options) },
      this.#modelOptions
    ) as ReturnType<ChatGoogleGenerativeAI['invocationParams']>;
  }
}

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
    const modelOptions = copilotModel.options ?? {};

    const fields = {
      ...params,
      model: copilotModel.model,
      streaming: true,
      temperature: toGeminiFiniteNumber(modelOptions['temperature']),
      topP: toGeminiFiniteNumber(modelOptions['top_p']),
      topK: toGeminiFiniteNumber(modelOptions['top_k']),
      maxOutputTokens: toGeminiFiniteNumber(modelOptions['max_output_tokens'] ?? modelOptions['max_tokens']),
      maxRetries: modelCredentials?.maxRetries,
    };
    return new GeminiChatGoogleGenerativeAI(
      {
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
      },
      modelOptions
    );
  }
}
