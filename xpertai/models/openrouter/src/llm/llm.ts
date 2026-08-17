import { ChatOpenAI } from '@langchain/openai';
import { LLMResult } from '@langchain/core/outputs';
import { AiModelTypeEnum, ICopilotModel } from '@xpert-ai/contracts';
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
          handleLLMTokens,
          {
            resolveReportedPrice: getOpenRouterReportedPrice,
            reportedPriceRequired: true,
          }
        ),
        this.createHandleLLMErrorCallbacks(fields, this.#logger),
      ],
    });
  }
}

export function getOpenRouterReportedPrice(output: LLMResult) {
  const usageCandidates = [
    output.llmOutput?.['usage'],
    ...(output.generations ?? [])
      .flat()
      .map(readGenerationUsage),
  ];

  for (const usage of usageCandidates) {
    if (!isRecord(usage)) continue;
    const amount = Number(usage['cost']);
    if (Number.isFinite(amount) && amount >= 0) {
      return { amount, currency: 'USD' };
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readGenerationUsage(
  generation: LLMResult['generations'][number][number]
) {
  if (!isRecord(generation) || !isRecord(generation['message'])) {
    return undefined;
  }
  const responseMetadata = generation['message']['response_metadata'];
  return isRecord(responseMetadata) ? responseMetadata['usage'] : undefined;
}
