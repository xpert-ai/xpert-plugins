import { AiModelTypeEnum, ICopilotModel } from '@metad/contracts';
import { Injectable, Logger } from '@nestjs/common';
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions,
} from '@xpert-ai/plugin-sdk';
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  ChatMessage,
  convertToProviderContentBlock,
  isAIMessage,
  isDataContentBlock,
  parseBase64DataUrl,
  parseMimeType,
} from '@langchain/core/messages';
import { ChatGenerationChunk } from '@langchain/core/outputs';
import { convertLangChainToolCallToOpenAI } from '@langchain/core/output_parsers/openai_tools';
import { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { DeepSeekProviderStrategy } from '../provider.strategy.js';
import { DeepseekCredentials, DeepseekModelCredentials, toCredentialKwargs } from '../types.js';

type StandardBlockMetadata = {
  detail?: string;
  filename?: string;
  name?: string;
  title?: string;
};

type StandardContentBlock = {
  source_type?: string;
  mime_type?: string;
  data?: string;
  url?: string;
  metadata?: StandardBlockMetadata;
  id?: string;
  text?: string;
};

type CompletionParam = {
  role: string;
  content: string | Array<unknown>;
  name?: string;
  function_call?: unknown;
  tool_calls?: unknown;
  tool_call_id?: unknown;
  reasoning_content?: unknown;
  audio?: {
    id: string;
  };
};

type DeepSeekCallOptions = TChatModelOptions & {
  signal?: AbortSignal;
  promptIndex?: number;
  options?: Record<string, unknown>;
};

type MessageWithKwargs = BaseMessage & {
  name?: string;
  tool_calls?: Array<unknown>;
  tool_call_id?: string;
  additional_kwargs?: {
    function_call?: unknown;
    tool_calls?: unknown;
    reasoning_content?: unknown;
    audio?: {
      id?: string;
    };
  };
};

type UsageMetadata = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_token_details?: {
    audio?: number;
    cache_read?: number;
  };
  output_token_details?: {
    audio?: number;
    reasoning?: number;
  };
};

type ChatCompletionUsage = {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    audio_tokens?: number;
    cached_tokens?: number;
  };
  completion_tokens_details?: {
    audio_tokens?: number;
    reasoning_tokens?: number;
  };
};

type ChatCompletionChoice = {
  index?: number;
  message?: {
    role?: string;
    content?: string;
  };
  finish_reason?: string;
  logprobs?: unknown;
  delta?: {
    role?: string;
    content?: string;
  };
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  system_fingerprint?: string;
  model?: string;
  service_tier?: string;
};

type GenerationInfo = {
  completion?: number;
  finish_reason?: string;
  logprobs?: unknown;
  system_fingerprint?: string;
  model_name?: string;
  service_tier?: string;
  prompt?: number;
};

const completionsApiContentBlockConverter = {
  providerName: 'DeepSeek',
  fromStandardTextBlock(block: StandardContentBlock) {
    return { type: 'text', text: block.text };
  },
  fromStandardImageBlock(block: StandardContentBlock) {
    if (block.source_type === 'url') {
      return {
        type: 'image_url',
        image_url: {
          url: block.url,
          ...(block.metadata?.detail ? { detail: block.metadata.detail } : {}),
        },
      };
    }
    if (block.source_type === 'base64') {
      const url = `data:${block.mime_type ?? ''};base64,${block.data}`;
      return {
        type: 'image_url',
        image_url: {
          url,
          ...(block.metadata?.detail ? { detail: block.metadata.detail } : {}),
        },
      };
    }
    throw new Error(
      `Image content blocks with source_type ${block.source_type} are not supported for DeepSeek completions`,
    );
  },
  fromStandardAudioBlock(block: StandardContentBlock) {
    if (block.source_type === 'url') {
      const data = parseBase64DataUrl({ dataUrl: block.url });
      if (!data) {
        throw new Error(
          `URL audio blocks with source_type ${block.source_type} must be formatted as a data URL for DeepSeek completions`,
        );
      }
      const rawMimeType = data.mime_type || block.mime_type || '';
      let mimeType;
      try {
        mimeType = parseMimeType(rawMimeType);
      } catch {
        throw new Error(
          `Audio blocks with source_type ${block.source_type} must have mime type of audio/wav or audio/mp3`,
        );
      }
      if (mimeType.type !== 'audio' || (mimeType.subtype !== 'wav' && mimeType.subtype !== 'mp3')) {
        throw new Error(
          `Audio blocks with source_type ${block.source_type} must have mime type of audio/wav or audio/mp3`,
        );
      }
      return {
        type: 'input_audio',
        input_audio: {
          format: mimeType.subtype,
          data: data.data,
        },
      };
    }
    if (block.source_type === 'base64') {
      if (block.mime_type !== 'audio/wav' && block.mime_type !== 'audio/mp3') {
        throw new Error(
          `Audio blocks with source_type ${block.source_type} must have mime type of audio/wav or audio/mp3`,
        );
      }
      return {
        type: 'input_audio',
        input_audio: {
          format: block.mime_type.replace('audio/', ''),
          data: block.data,
        },
      };
    }
    throw new Error(`Audio content blocks with source_type ${block.source_type} are not supported for DeepSeek completions`);
  },
  fromStandardFileBlock(block: StandardContentBlock) {
    if (block.source_type === 'url') {
      return {
        type: 'input_text',
        text: {
          data: block.url,
        },
      };
    }
    if (block.source_type === 'base64') {
      return {
        type: 'file',
        file: {
          file_data: `data:${block.mime_type ?? ''};base64,${block.data}`,
          ...(block.metadata?.filename || block.metadata?.name || block.metadata?.title
            ? {
                filename: block.metadata?.filename || block.metadata?.name || block.metadata?.title,
              }
            : {}),
        },
      };
    }
    if (block.source_type === 'id') {
      return {
        type: 'file',
        file: {
          file_id: block.id,
        },
      };
    }
    throw new Error(`File content blocks with source_type ${block.source_type} are not supported for DeepSeek completions`);
  },
};

function isReasoningModel(model?: string) {
  return !!model && /(^|[-_])reasoner$/i.test(model);
}

function messageToOpenAIRole(message: BaseMessage) {
  const type = message._getType();
  switch (type) {
    case 'system':
      return 'system';
    case 'ai':
      return 'assistant';
    case 'human':
      return 'user';
    case 'function':
      return 'function';
    case 'tool':
      return 'tool';
    case 'generic': {
      if (!ChatMessage.isInstance(message)) throw new Error('Invalid generic chat message');
      return message.role;
    }
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

function convertMessageToOpenAIParams(message: BaseMessage, model: string): CompletionParam[] {
  const role = messageToOpenAIRole(message);
  // Note: DeepSeek API only accepts 'system', 'user', 'assistant', 'tool' roles
  // Do not convert 'system' to 'developer' as it's not supported by the API
  // Ensure role is never 'developer' - if it is, log error and use 'system' instead
  if (role === 'developer') {
    console.error('[DeepSeek] ERROR: Received developer role, converting to system. Model:', model);
    // This should never happen, but if it does, convert to system
  }
  const finalRole = role === 'developer' ? 'system' : role;
  const messageWithKwargs = message as MessageWithKwargs;
  const content =
    typeof message.content === 'string'
      ? message.content
      : (message.content as Array<unknown>).map((m) =>
          isDataContentBlock(m as object)
            ? convertToProviderContentBlock(m as never, completionsApiContentBlockConverter)
            : m,
        );
  const completionParam: CompletionParam = {
    role: finalRole,
    content,
  };
  if (messageWithKwargs.name != null) {
    completionParam.name = messageWithKwargs.name;
  }
  if (messageWithKwargs.additional_kwargs?.function_call != null) {
    completionParam.function_call = messageWithKwargs.additional_kwargs.function_call;
    completionParam.content = '';
  }
  if (isAIMessage(message) && !!messageWithKwargs.tool_calls?.length) {
    completionParam.tool_calls = (messageWithKwargs.tool_calls as Array<{ name: string; args: unknown }>).map(convertLangChainToolCallToOpenAI);
    completionParam.content = '';
  } else {
    if (messageWithKwargs.additional_kwargs?.tool_calls != null) {
      completionParam.tool_calls = messageWithKwargs.additional_kwargs.tool_calls;
    }
    if (messageWithKwargs.tool_call_id != null) {
      completionParam.tool_call_id = messageWithKwargs.tool_call_id;
    }
  }
  // Critical: Always include reasoning_content if present in assistant messages
  // This is required by DeepSeek API for multi-turn conversations with reasoning model
  // The reasoning_content must be included in subsequent requests after the first response
  if (messageWithKwargs.additional_kwargs?.reasoning_content) {
    completionParam.reasoning_content = messageWithKwargs.additional_kwargs.reasoning_content;
  }
  const audioId = messageWithKwargs.additional_kwargs?.audio?.id;
  if (audioId) {
    const audioMessage: CompletionParam = {
      role: 'assistant',
      content: '',
      audio: {
        id: audioId,
      },
    };
    return [completionParam, audioMessage];
  }
  return [completionParam];
}

/**
 * Convert messages to OpenAI-compatible params while preserving DeepSeek reasoning content.
 */
function convertMessagesToOpenAIParamsWithReasoning(messages: BaseMessage[], model: string) {
  return messages.flatMap((message) => convertMessageToOpenAIParams(message, model));
}

/**
 * DeepSeek-specific chat model that overrides generation and streaming paths to
 * ensure reasoning_content from assistant messages is forwarded in subsequent requests.
 */
export class DeepSeekChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  override async _generate(
    messages: BaseMessage[],
    options?: DeepSeekCallOptions,
    runManager?: CallbackManagerForLLMRun,
  ) {
    const usageMetadata: UsageMetadata = {};
    const params = this.invocationParams(options);
    const messagesMapped = convertMessagesToOpenAIParamsWithReasoning(messages, this.model ?? '');
    const paramsWithStream = params as { stream?: boolean };
    if (paramsWithStream.stream) {
      const stream = this._streamResponseChunks(messages, options, runManager);
      const finalChunks: Record<number, ChatGenerationChunk> = {};
      for await (const chunk of stream) {
        const message = chunk.message as AIMessage & { response_metadata?: Record<string, unknown> };
        message.response_metadata = {
          ...(chunk.generationInfo as GenerationInfo),
          ...message.response_metadata,
        };
        const index = (chunk.generationInfo as GenerationInfo)?.completion ?? 0;
        if (finalChunks[index] === undefined) {
          finalChunks[index] = chunk;
        } else {
          finalChunks[index] = finalChunks[index].concat(chunk);
        }
      }
      const generations = Object.entries(finalChunks)
        .sort(([aKey], [bKey]) => parseInt(aKey, 10) - parseInt(bKey, 10))
        .map(([, value]) => value);
      const { functions, function_call } = this.invocationParams(options);
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
      // Enable thinking mode for deepseek-chat
      // According to DeepSeek API docs, thinking mode can be enabled by:
      // 1. Setting model to "deepseek-reasoner"
      // 2. Setting thinking parameter: "thinking": {"type": "enabled"}
      // For OpenAI SDK, thinking parameter should be passed in extra_body
      // Final safety check: ensure no developer role in messages
      const safeMessages = (messagesMapped as Array<{ role?: string; [key: string]: unknown }>).map((msg) => {
        if (msg.role === 'developer') {
          console.error('[DeepSeek] CRITICAL: Found developer role in message, converting to system. Model:', this.model);
          return { ...msg, role: 'system' };
        }
        return msg;
      });
      
      const requestParams = {
        ...params,
        stream: false,
        messages: safeMessages as never,
      } as Record<string, unknown>;
      
      // Enable think mode for deepseek-chat model
      // According to DeepSeek API docs, thinking mode can be enabled by:
      // 1. Setting model to "deepseek-reasoner"
      // 2. Setting thinking parameter: "thinking": {"type": "enabled"}
      // IMPORTANT: Test results show that directly using thinking parameter works,
      // but using extra_body does NOT work. So we use thinking parameter directly.
      if (this.model === 'deepseek-chat') {
        // Directly add thinking parameter to request body (not in extra_body)
        // This is the working method according to test results
        requestParams.thinking = {
          type: 'enabled',
        };
      }
      
      const data = (await this.completionWithRetry(
        requestParams as never,
        {
          signal: options?.signal,
          ...options?.options,
        },
      )) as ChatCompletionResponse;
      const {
        completion_tokens: completionTokens,
        prompt_tokens: promptTokens,
        total_tokens: totalTokens,
        prompt_tokens_details: promptTokensDetails,
        completion_tokens_details: completionTokensDetails,
      } = data?.usage ?? {};
      if (completionTokens) {
        usageMetadata.output_tokens = (usageMetadata.output_tokens ?? 0) + completionTokens;
      }
      if (promptTokens) {
        usageMetadata.input_tokens = (usageMetadata.input_tokens ?? 0) + promptTokens;
      }
      if (totalTokens) {
        usageMetadata.total_tokens = (usageMetadata.total_tokens ?? 0) + totalTokens;
      }
      if (promptTokensDetails?.audio_tokens !== undefined || promptTokensDetails?.cached_tokens !== undefined) {
        usageMetadata.input_token_details = {
          ...(promptTokensDetails?.audio_tokens !== undefined && {
            audio: promptTokensDetails?.audio_tokens,
          }),
          ...(promptTokensDetails?.cached_tokens !== undefined && {
            cache_read: promptTokensDetails?.cached_tokens,
          }),
        };
      }
      if (
        completionTokensDetails?.audio_tokens !== undefined ||
        completionTokensDetails?.reasoning_tokens !== undefined
      ) {
        usageMetadata.output_token_details = {
          ...(completionTokensDetails?.audio_tokens !== undefined && {
            audio: completionTokensDetails?.audio_tokens,
          }),
          ...(completionTokensDetails?.reasoning_tokens !== undefined && {
            reasoning: completionTokensDetails?.reasoning_tokens,
          }),
        };
      }
      const generations: Array<{
        text: string;
        message: BaseMessage;
        generationInfo?: GenerationInfo;
      }> = [];
      for (const part of data?.choices ?? []) {
        const text = part.message?.content ?? '';
        const generation: {
          text: string;
          message: BaseMessage;
          generationInfo?: GenerationInfo;
        } = {
          text,
          message: this._convertCompletionsMessageToBaseMessage(
            (part.message ?? { role: 'assistant', refusal: undefined }) as never,
            data as never,
          ),
        };
        generation.generationInfo = {
          ...(part.finish_reason ? { finish_reason: part.finish_reason } : {}),
          ...(part.logprobs ? { logprobs: part.logprobs } : {}),
        };
        if (isAIMessage(generation.message)) {
          generation.message.usage_metadata = {
            input_tokens: usageMetadata.input_tokens ?? 0,
            output_tokens: usageMetadata.output_tokens ?? 0,
            total_tokens: usageMetadata.total_tokens ?? 0,
            ...(usageMetadata.input_token_details && {
              input_token_details: usageMetadata.input_token_details,
            }),
            ...(usageMetadata.output_token_details && {
              output_token_details: usageMetadata.output_token_details,
            }),
          };
        }
        // Preserve additional_kwargs (including reasoning_content) when creating new AIMessage
        const messageWithKwargs = generation.message as MessageWithKwargs;
        const filteredEntries = Object.fromEntries(
          Object.entries(generation.message).filter(([key]) => !key.startsWith('lc_'))
        ) as { content: string | unknown[]; additional_kwargs?: Record<string, unknown>; [key: string]: unknown };
        // Explicitly preserve additional_kwargs to ensure reasoning_content is retained
        // Merge additional_kwargs to preserve all fields including reasoning_content
        if (messageWithKwargs.additional_kwargs) {
          filteredEntries.additional_kwargs = {
            ...(filteredEntries.additional_kwargs || {}),
            ...messageWithKwargs.additional_kwargs,
          };
        } else if (filteredEntries.additional_kwargs) {
          // Keep existing additional_kwargs if messageWithKwargs doesn't have it
          // This ensures reasoning_content from _convertCompletionsMessageToBaseMessage is preserved
        }
        generation.message = new AIMessage(filteredEntries);
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

  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: DeepSeekCallOptions,
    runManager?: CallbackManagerForLLMRun,
  ) {
    const messagesMapped = convertMessagesToOpenAIParamsWithReasoning(
      messages,
      this.model ?? '',
    );
    
    // Final safety check: ensure no developer role in messages
    const safeMessages = (messagesMapped as Array<{ role?: string; [key: string]: unknown }>).map((msg) => {
      if (msg.role === 'developer') {
        console.error('[DeepSeek] CRITICAL: Found developer role in message (streaming), converting to system. Model:', this.model);
        return { ...msg, role: 'system' };
      }
      return msg;
    });
    
    const params = {
      ...this.invocationParams(options, {
        streaming: true,
      }),
      messages: safeMessages as never,
      stream: true,
    } as Record<string, unknown>;
    
    // Enable think mode for deepseek-chat model in streaming
    // IMPORTANT: Test results show that directly using thinking parameter works,
    // but using extra_body does NOT work. So we use thinking parameter directly.
    if (this.model === 'deepseek-chat') {
      // Directly add thinking parameter to request body (not in extra_body)
      // This is the working method according to test results
      params.thinking = {
        type: 'enabled',
      };
    }
    let defaultRole: 'function' | 'system' | 'tool' | 'assistant' | 'user' | undefined;
    const streamIterable = (await this.completionWithRetry(
      params as never,
      options,
    )) as AsyncIterable<ChatCompletionResponse & { id?: string; created?: number; object?: string }>;
    let usage: ChatCompletionUsage | undefined;
    for await (const data of streamIterable) {
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
        delta as { role?: string; content?: string; refusal?: string },
        data as never,
        defaultRole as 'function' | 'system' | 'tool' | 'assistant' | 'user' | undefined,
      ) as AIMessageChunk;
      defaultRole = (delta.role as 'function' | 'system' | 'tool' | 'assistant' | 'user' | undefined) ?? defaultRole;
      const newTokenIndices = {
        prompt: options?.promptIndex ?? 0,
        completion: choice.index ?? 0,
      };
      if (typeof chunk.content !== 'string') {
        continue;
      }
      const generationInfo: GenerationInfo = { ...newTokenIndices };
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
        ...(usage.prompt_tokens_details?.audio_tokens !== undefined && {
          audio: usage.prompt_tokens_details?.audio_tokens,
        }),
        ...(usage.prompt_tokens_details?.cached_tokens !== undefined && {
          cache_read: usage.prompt_tokens_details?.cached_tokens,
        }),
      };
      const outputTokenDetails = {
        ...(usage.completion_tokens_details?.audio_tokens !== undefined && {
          audio: usage.completion_tokens_details?.audio_tokens,
        }),
        ...(usage.completion_tokens_details?.reasoning_tokens !== undefined && {
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
      throw new Error('Request was aborted');
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
      const chatModel = new DeepSeekChatOAICompatReasoningModel({
        ...toCredentialKwargs(credentials),
        model,
        temperature: 0,
        maxTokens: 5,
      });
      await chatModel.invoke([
        {
          role: 'human',
          content: 'Hi',
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
    const credentials = modelProvider.credentials as DeepseekCredentials;
    const params = toCredentialKwargs(credentials);
    const modelCredentials = copilotModel.options as DeepseekModelCredentials;

    const model = copilotModel.model;
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
    };

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
