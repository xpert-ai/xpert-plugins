import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import { _convertMessagesToOpenAIParams as convertMessagesToOpenAIParams } from '@langchain/openai/dist/chat_models.js';
import { BaseMessage, AIMessage, AIMessageChunk, isAIMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { DeepSeekProviderStrategy } from '../provider.strategy.js';
import { DeepseekCredentials, DeepseekModelCredentials, toCredentialKwargs } from '../types.js';

function convertMessagesToOpenAIParamsWithReasoning(messages: BaseMessage[], model: string) {
  return messages.flatMap((message) => {
    const converted = convertMessagesToOpenAIParams([message], model);
    if (
      isAIMessage(message) &&
      message.additional_kwargs?.reasoning_content &&
      Array.isArray(converted) &&
      converted.length > 0
    ) {
      const [first, ...rest] = converted;
      return [
        {
          ...first,
          reasoning_content:
            (first as any).reasoning_content ?? message.additional_kwargs.reasoning_content,
        },
        ...rest,
      ];
    }
    return converted;
  });
}

class DeepSeekChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  override async _generate(messages: BaseMessage[], options?: any, runManager?: any) {
    const usageMetadata: Record<string, any> = {};
    const params = this.invocationParams(options as any);
    const messagesMapped = convertMessagesToOpenAIParamsWithReasoning(
      messages,
      (this as any).model ?? '',
    );
    if ((params as any).stream) {
      const stream = this._streamResponseChunks(messages, options, runManager);
      const finalChunks: Record<number, ChatGenerationChunk> = {};
      for await (const chunk of stream) {
        (chunk.message as any).response_metadata = {
          ...chunk.generationInfo,
          ...(chunk.message as any).response_metadata,
        };
        const index = (chunk.generationInfo as any)?.completion ?? 0;
        if (finalChunks[index] === undefined) {
          finalChunks[index] = chunk;
        } else {
          finalChunks[index] = finalChunks[index].concat(chunk);
        }
      }
      const generations = Object.entries(finalChunks)
        .sort(([aKey], [bKey]) => parseInt(aKey, 10) - parseInt(bKey, 10))
        .map(([_, value]) => value);
      const { functions, function_call } = this.invocationParams(options as any);
      const promptTokenUsage = await this._getEstimatedTokenCountFromPrompt(
        messages,
        functions,
        function_call,
      );
      const completionTokenUsage = await this._getNumTokensFromGenerations(generations);
      usageMetadata.input_tokens = promptTokenUsage;
      usageMetadata.output_tokens = completionTokenUsage;
      usageMetadata.total_tokens = promptTokenUsage + completionTokenUsage;
      return {
        generations,
        llmOutput: {
          estimatedTokenUsage: {
            promptTokens: usageMetadata.input_tokens,
            completionTokens: usageMetadata.output_tokens,
            totalTokens: usageMetadata.total_tokens,
          },
        },
      };
    } else {
      const data = await this.completionWithRetry(
        {
          ...params,
          stream: false,
          messages: messagesMapped,
        },
        {
          signal: options?.signal,
          ...(options as any)?.options,
        },
      );
      const {
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        total_tokens: totalTokens,
        prompt_tokens_details: promptTokensDetails,
        completion_tokens_details: completionTokensDetails,
      } = (data as any)?.usage ?? {};
      if (completionTokens) {
        usageMetadata.output_tokens = (usageMetadata.output_tokens ?? 0) + completionTokens;
      }
      if (promptTokens) {
        usageMetadata.input_tokens = (usageMetadata.input_tokens ?? 0) + promptTokens;
      }
      if (totalTokens) {
        usageMetadata.total_tokens = (usageMetadata.total_tokens ?? 0) + totalTokens;
      }
      if (promptTokensDetails?.audio_tokens !== null || promptTokensDetails?.cached_tokens !== null) {
        usageMetadata.input_token_details = {
          ...(promptTokensDetails?.audio_tokens !== null && {
            audio: promptTokensDetails?.audio_tokens,
          }),
          ...(promptTokensDetails?.cached_tokens !== null && {
            cache_read: promptTokensDetails?.cached_tokens,
          }),
        };
      }
      if (
        completionTokensDetails?.audio_tokens !== null ||
        completionTokensDetails?.reasoning_tokens !== null
      ) {
        usageMetadata.output_token_details = {
          ...(completionTokensDetails?.audio_tokens !== null && {
            audio: completionTokensDetails?.audio_tokens,
          }),
          ...(completionTokensDetails?.reasoning_tokens !== null && {
            reasoning: completionTokensDetails?.reasoning_tokens,
          }),
        };
      }
      const generations: Array<any> = [];
      for (const part of (data as any)?.choices ?? []) {
        const text = part.message?.content ?? '';
        const generation: any = {
          text,
          message: this._convertCompletionsMessageToBaseMessage(
            part.message ?? { role: 'assistant' },
            data,
          ),
        };
        generation.generationInfo = {
          ...(part.finish_reason ? { finish_reason: part.finish_reason } : {}),
          ...(part.logprobs ? { logprobs: part.logprobs } : {}),
        };
        if (isAIMessage(generation.message)) {
          generation.message.usage_metadata = usageMetadata;
        }
        generation.message = new AIMessage(
          Object.fromEntries(Object.entries(generation.message).filter(([key]) => !key.startsWith('lc_'))),
        );
        generations.push(generation);
      }
      return {
        generations,
        llmOutput: {
          tokenUsage: {
            promptTokens: usageMetadata.input_tokens,
            completionTokens: usageMetadata.output_tokens,
            totalTokens: usageMetadata.total_tokens,
          },
        },
      };
    }
  }

  protected override async *_streamResponseChunks(messages: BaseMessage[], options?: any, runManager?: any) {
    const messagesMapped = convertMessagesToOpenAIParamsWithReasoning(
      messages,
      (this as any).model ?? '',
    );
    const params = {
      ...this.invocationParams(options as any, {
        streaming: true,
      }),
      messages: messagesMapped,
      stream: true,
    };
    let defaultRole;
    const streamIterable = await this.completionWithRetry(params as any, options as any);
    let usage;
    for await (const data of streamIterable as any) {
      const choice = data?.choices?.[0];
      if (data.usage) {
        usage = data.usage;
      }
      if (!choice) {
        continue;
      }
      const { delta } = choice;
      if (!delta) {
        continue;
      }
      const chunk = this._convertCompletionsDeltaToBaseMessageChunk(
        delta,
        data,
        defaultRole,
      ) as AIMessageChunk;
      defaultRole = delta.role ?? defaultRole;
      const newTokenIndices = {
        prompt: options?.promptIndex ?? 0,
        completion: choice.index ?? 0,
      };
      if (typeof chunk.content !== 'string') {
        continue;
      }
      const generationInfo: Record<string, any> = { ...newTokenIndices };
      if (choice.finish_reason != null) {
        generationInfo.finish_reason = choice.finish_reason;
        generationInfo.system_fingerprint = data.system_fingerprint;
        generationInfo.model_name = data.model;
        generationInfo.service_tier = data.service_tier;
      }
      const generationChunk = new ChatGenerationChunk({
        message: chunk,
        text: chunk.content,
        generationInfo,
      });
      yield generationChunk;
      await runManager?.handleLLMNewToken(
        generationChunk.text ?? '',
        newTokenIndices,
        undefined,
        undefined,
        undefined,
        { chunk: generationChunk },
      );
    }
    if (usage) {
      const inputTokenDetails = {
        ...(usage.prompt_tokens_details?.audio_tokens !== null && {
          audio: usage.prompt_tokens_details?.audio_tokens,
        }),
        ...(usage.prompt_tokens_details?.cached_tokens !== null && {
          cache_read: usage.prompt_tokens_details?.cached_tokens,
        }),
      };
      const outputTokenDetails = {
        ...(usage.completion_tokens_details?.audio_tokens !== null && {
          audio: usage.completion_tokens_details?.audio_tokens,
        }),
        ...(usage.completion_tokens_details?.reasoning_tokens !== null && {
          reasoning: usage.completion_tokens_details?.reasoning_tokens,
        }),
      };
      const generationChunk = new ChatGenerationChunk({
        message: new AIMessageChunk({
          content: '',
          response_metadata: {
            usage: { ...usage },
          },
          usage_metadata: {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
            ...(Object.keys(inputTokenDetails).length > 0 && {
              input_token_details: inputTokenDetails,
            }),
            ...(Object.keys(outputTokenDetails).length > 0 && {
              output_token_details: outputTokenDetails,
            }),
          },
        }),
        text: '',
      });
      yield generationChunk;
    }
    if (options?.signal?.aborted) {
      throw new Error('AbortError');
    }
  }
}

@Injectable()
export class DeepSeekLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(DeepSeekLargeLanguageModel.name);

  constructor(modelProvider: DeepSeekProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  async validateCredentials(model: string, credentials: DeepseekCredentials): Promise<void> {
		try {
			const chatModel = new ChatOAICompatReasoningModel({
				...toCredentialKwargs(credentials),
				model,
				temperature: 0,
				maxTokens: 5
			})
			await chatModel.invoke([
				{
					role: 'human',
					content: `Hi`
				}
			])
		} catch (err) {
			throw new CredentialsValidateFailedError(getErrorMessage(err))
		}
	}

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { handleLLMTokens } = options ?? {}
		const { copilot } = copilotModel
		const { modelProvider } = copilot
		const credentials = modelProvider.credentials as DeepseekCredentials
		const params = toCredentialKwargs(credentials)
		const modelCredentials = copilotModel.options as DeepseekModelCredentials

		const model = copilotModel.model
		const fields = {
			...params,
			model,
			streaming: modelCredentials?.streaming ?? true,
			temperature: modelCredentials?.temperature ?? 0,
			maxTokens: modelCredentials?.max_tokens,
			topP: modelCredentials?.top_p,
			frequencyPenalty: modelCredentials?.frequency_penalty,
			maxRetries: modelCredentials?.maxRetries,
			streamUsage: false,
			verbose: options?.verbose,
		}

    return new DeepSeekChatOAICompatReasoningModel({
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
