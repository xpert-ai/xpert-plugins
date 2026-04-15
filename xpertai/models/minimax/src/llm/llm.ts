import { AIMessage, AIMessageChunk, BaseMessage } from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { OpenAIClient } from '@langchain/openai';
import { Injectable } from '@nestjs/common';
import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk';
import { MiniMaxProviderStrategy } from '../provider.strategy.js';
import { MiniMaxModelCredentials, SUPPORTED_LLM_MODELS, toCredentialKwargs } from '../types.js';

const THINK_START_TAG = '<think>';
const THINK_END_TAG = '</think>';

type MiniMaxReasoningDetail = {
  id?: string;
  text?: string;
  type?: string;
  [key: string]: unknown;
};

function extractReasoningText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value
      .map((item) => extractReasoningText(item))
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .join('');

    return text || undefined;
  }

  if (value && typeof value === 'object' && typeof (value as MiniMaxReasoningDetail).text === 'string') {
    return (value as MiniMaxReasoningDetail).text;
  }

  return undefined;
}

function extractTaggedReasoning(
  content: string,
  isInReasoningMode: boolean
): { handled: boolean; reasoning: string; text: string; inReasoningMode: boolean } {
  if (!isInReasoningMode && !content.includes(THINK_START_TAG) && !content.includes(THINK_END_TAG)) {
    return {
      handled: false,
      reasoning: '',
      text: content,
      inReasoningMode: false
    };
  }

  let remaining = content;
  let reasoning = '';
  let text = '';
  let inReasoningMode = isInReasoningMode;

  while (remaining.length) {
    if (inReasoningMode) {
      const endIndex = remaining.indexOf(THINK_END_TAG);
      if (endIndex === -1) {
        reasoning += remaining;
        remaining = '';
        break;
      }

      reasoning += remaining.slice(0, endIndex);
      remaining = remaining.slice(endIndex + THINK_END_TAG.length);
      inReasoningMode = false;
      continue;
    }

    const startIndex = remaining.indexOf(THINK_START_TAG);
    if (startIndex === -1) {
      text += remaining;
      remaining = '';
      break;
    }

    text += remaining.slice(0, startIndex);
    remaining = remaining.slice(startIndex + THINK_START_TAG.length);
    inReasoningMode = true;
  }

  return {
    handled: true,
    reasoning,
    text,
    inReasoningMode
  };
}

class MiniMaxChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  private streamedReasoning = new Map<number, string>();
  private streamedReasoningDetails = new Map<number, unknown>();
  private tagReasoningState = new Map<number, boolean>();

  override async _generate(
    messages: BaseMessage[],
    options?: Parameters<ChatOAICompatReasoningModel['_generate']>[1],
    runManager?: Parameters<ChatOAICompatReasoningModel['_generate']>[2]
  ) {
    this.resetReasoningState();
    const callOptions = options ?? {};

    const params = this.invocationParams(callOptions);
    if (!params.stream) {
      return super._generate(messages, callOptions, runManager);
    }

    const stream = super._streamResponseChunks(messages, callOptions, runManager);
    const finalChunks: Record<number, ChatGenerationChunk> = {};
    const accumulatedReasoningContent: Record<number, string> = {};
    const latestReasoningDetails: Record<number, unknown> = {};

    for await (const chunk of stream) {
      const message = chunk.message as AIMessageChunk & {
        response_metadata?: Record<string, unknown>;
      };
      message.response_metadata = {
        ...(chunk.generationInfo ?? {}),
        ...message.response_metadata
      };

      const index = chunk.generationInfo?.completion ?? 0;
      const chunkReasoning = message.additional_kwargs?.reasoning_content;
      if (typeof chunkReasoning === 'string' && chunkReasoning.length > 0) {
        accumulatedReasoningContent[index] = (accumulatedReasoningContent[index] ?? '') + chunkReasoning;
      }

      if ('reasoning_details' in (message.additional_kwargs ?? {})) {
        latestReasoningDetails[index] = message.additional_kwargs?.reasoning_details;
      }

      if (finalChunks[index] === undefined) {
        finalChunks[index] = chunk;
      } else {
        finalChunks[index] = finalChunks[index].concat(chunk);
      }
    }

    const generations = Object.entries(finalChunks)
      .sort(([aKey], [bKey]) => parseInt(aKey, 10) - parseInt(bKey, 10))
      .map(([key, value]) => {
        const index = parseInt(key, 10);
        const message = value.message as AIMessageChunk;
        message.additional_kwargs = {
          ...message.additional_kwargs,
          ...(index in accumulatedReasoningContent
            ? { reasoning_content: accumulatedReasoningContent[index] ?? '' }
            : {}),
          ...(index in latestReasoningDetails
            ? { reasoning_details: latestReasoningDetails[index] }
            : {})
        };

        return value;
      });

    const { functions, function_call } = this.invocationParams(callOptions);
    const promptTokenUsage = await this._getEstimatedTokenCountFromPrompt(
      messages,
      functions,
      function_call
    );
    const completionTokenUsage = await this._getNumTokensFromGenerations(generations);

    return {
      generations,
      llmOutput: {
        estimatedTokenUsage: {
          promptTokens: promptTokenUsage,
          completionTokens: completionTokenUsage,
          totalTokens: promptTokenUsage + completionTokenUsage
        }
      }
    };
  }

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>[1],
    runManager?: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>[2]
  ) {
    this.resetReasoningState();
    const callOptions = options ?? {};

    for await (const chunk of super._streamResponseChunks(messages, callOptions, runManager)) {
      yield chunk;
    }
  }

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, any>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ) {
    const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole);
    messageChunk.additional_kwargs ??= {};

    const choiceIndex = rawResponse.choices?.[0]?.index ?? 0;

    if ('reasoning_details' in delta) {
      const reasoningText = extractReasoningText(delta.reasoning_details);
      const previousReasoning = this.streamedReasoning.get(choiceIndex) ?? '';
      const nextReasoning = reasoningText
        ? reasoningText.startsWith(previousReasoning)
          ? reasoningText
          : `${previousReasoning}${reasoningText}`
        : previousReasoning;
      const incrementalReasoning =
        reasoningText && reasoningText.startsWith(previousReasoning)
          ? reasoningText.slice(previousReasoning.length)
          : reasoningText;

      this.streamedReasoning.set(choiceIndex, nextReasoning);
      this.streamedReasoningDetails.set(choiceIndex, delta.reasoning_details);
      messageChunk.additional_kwargs['reasoning_details'] = delta.reasoning_details;

      if (incrementalReasoning) {
        messageChunk.additional_kwargs['reasoning_content'] = incrementalReasoning;
      } else {
        delete messageChunk.additional_kwargs['reasoning_content'];
      }

      messageChunk.content = '';
      return messageChunk;
    }

    const rawContent = typeof delta.content === 'string' ? delta.content : '';
    if (!rawContent) {
      return messageChunk;
    }

    const tagged = extractTaggedReasoning(rawContent, this.tagReasoningState.get(choiceIndex) ?? false);
    if (!tagged.handled) {
      return messageChunk;
    }

    this.tagReasoningState.set(choiceIndex, tagged.inReasoningMode);
    if (tagged.reasoning) {
      messageChunk.additional_kwargs['reasoning_content'] = tagged.reasoning;
    } else {
      delete messageChunk.additional_kwargs['reasoning_content'];
    }
    messageChunk.content = tagged.text;

    return messageChunk;
  }

  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAIClient.ChatCompletionMessage & {
      reasoning_details?: unknown;
    },
    rawResponse: OpenAIClient.ChatCompletion
  ) {
    const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse) as AIMessage;
    langChainMessage.additional_kwargs ??= {};

    if ('reasoning_details' in message) {
      langChainMessage.additional_kwargs['reasoning_details'] = message.reasoning_details;
      const reasoningText = extractReasoningText(message.reasoning_details);
      if (reasoningText) {
        langChainMessage.additional_kwargs['reasoning_content'] = reasoningText;
      }
      return langChainMessage;
    }

    if (typeof langChainMessage.content !== 'string') {
      return langChainMessage;
    }

    const tagged = extractTaggedReasoning(langChainMessage.content, false);
    if (tagged.handled && tagged.reasoning) {
      langChainMessage.additional_kwargs['reasoning_content'] = tagged.reasoning;
      langChainMessage.content = tagged.text;
    }

    return langChainMessage;
  }

  private resetReasoningState() {
    this.streamedReasoning.clear();
    this.streamedReasoningDetails.clear();
    this.tagReasoningState.clear();
  }
}

@Injectable()
export class MiniMaxLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: MiniMaxProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM);
  }

  protected createChatModel(params: object) {
    return new MiniMaxChatOAICompatReasoningModel(params);
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { copilot } = copilotModel;
    const { modelProvider } = copilot;
    const modelCredentials = mergeCredentials(modelProvider.credentials, options?.modelProperties) as MiniMaxModelCredentials;
    const model = copilotModel.model;

    const params = toCredentialKwargs(modelCredentials, model);

    return this.createChatModel({
      ...params,
      model,
      modelKwargs: {
        reasoning_split: true
      },
      streaming: copilotModel.options?.['streaming'] ?? true,
      temperature: copilotModel.options?.['temperature'] ?? 0,
      maxTokens: copilotModel.options?.['max_tokens'],
      verbose: options?.verbose
    });
  }

  async validateCredentials(model: string, credentials: MiniMaxModelCredentials): Promise<void> {
    if (!model || !SUPPORTED_LLM_MODELS.includes(model)) {
      throw new CredentialsValidateFailedError(`LLM model ${model} is not supported`);
    }
    if (!credentials.api_key) {
      throw new CredentialsValidateFailedError('API key is required');
    }
    if (!credentials.group_id) {
      throw new CredentialsValidateFailedError('Group ID is required');
    }
  }

  static getSupportedModels() {
    return SUPPORTED_LLM_MODELS;
  }
}
