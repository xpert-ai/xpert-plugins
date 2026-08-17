import { ChatAnthropic, AnthropicInput } from '@langchain/anthropic'
import type { Callbacks } from '@langchain/core/callbacks/manager'
import type { LLMResult } from '@langchain/core/outputs'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  LLMPriceContext,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions,
  mergeCredentials
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { AnthropicCredentials, AnthropicModelCredentials, toCredentialKwargs } from '../types.js'
import { AnthropicProviderStrategy } from '../provider.strategy.js'
import { enhanceChatAnthropicWithPromptCaching } from './chat-model-enhancer.js'
import {
  AnthropicPromptCachingOptions,
  buildAnthropicBetaHeader,
  buildAnthropicThinkingConfig,
  hasPromptCachingEnabled,
  normalizeBoolean,
  normalizeInteger,
  normalizeNumber
} from './runtime-options.js'

type AnthropicChatModelParams = AnthropicInput & {
  callbacks?: Callbacks
  promptCaching?: AnthropicPromptCachingOptions
}

type AnthropicCacheCreationUsage = {
  ephemeral5mInputTokens: number
  ephemeral1hInputTokens: number
}

export function getAnthropicPricingContext(output: LLMResult): LLMPriceContext {
  let ephemeral5mInputTokens = 0
  let ephemeral1hInputTokens = 0
  let hasCacheCreationBreakdown = false

  for (const generation of output.generations ?? []) {
    for (const item of generation) {
      if (!('message' in item)) continue
      const message = item.message
      if (typeof message !== 'object' || message === null || !('response_metadata' in message)) continue
      const cacheCreation = readAnthropicCacheCreation(message.response_metadata)
      if (!cacheCreation) continue

      hasCacheCreationBreakdown = true
      ephemeral5mInputTokens += cacheCreation.ephemeral5mInputTokens
      ephemeral1hInputTokens += cacheCreation.ephemeral1hInputTokens
    }
  }

  return hasCacheCreationBreakdown
    ? {
        cacheWriteInputTokensByTtl: {
          '5m': ephemeral5mInputTokens,
          '1h': ephemeral1hInputTokens
        }
      }
    : {}
}

function readAnthropicCacheCreation(responseMetadata: unknown): AnthropicCacheCreationUsage | undefined {
  if (typeof responseMetadata !== 'object' || responseMetadata === null || !('usage' in responseMetadata)) {
    return undefined
  }
  const usage = responseMetadata.usage
  if (typeof usage !== 'object' || usage === null || !('cache_creation' in usage)) {
    return undefined
  }
  const cacheCreation = usage.cache_creation
  if (
    typeof cacheCreation !== 'object' ||
    cacheCreation === null ||
    !('ephemeral_5m_input_tokens' in cacheCreation) ||
    !('ephemeral_1h_input_tokens' in cacheCreation)
  ) {
    return undefined
  }
  const ephemeral5mInputTokens = cacheCreation.ephemeral_5m_input_tokens
  const ephemeral1hInputTokens = cacheCreation.ephemeral_1h_input_tokens
  if (
    !Number.isInteger(ephemeral5mInputTokens) ||
    Number(ephemeral5mInputTokens) < 0 ||
    !Number.isInteger(ephemeral1hInputTokens) ||
    Number(ephemeral1hInputTokens) < 0
  ) {
    return undefined
  }

  return {
    ephemeral5mInputTokens: Number(ephemeral5mInputTokens),
    ephemeral1hInputTokens: Number(ephemeral1hInputTokens)
  }
}

@Injectable()
export class AnthropicLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(AnthropicLargeLanguageModel.name)

  constructor(modelProvider: AnthropicProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: AnthropicCredentials): Promise<void> {
    const params = toCredentialKwargs(credentials, model)

    try {
      const chatModel = this.createChatModel({
        ...params,
        temperature: 0,
        maxTokens: 5
      })
      await chatModel.invoke([
        {
          role: 'human',
          content: 'Hi'
        }
      ])
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  protected createChatModel(params: AnthropicChatModelParams) {
    const { promptCaching, ...fields } = params
    const chatModel = new ChatAnthropic(fields)

    if (promptCaching && hasPromptCachingEnabled(promptCaching)) {
      return enhanceChatAnthropicWithPromptCaching(chatModel, promptCaching)
    }

    return chatModel
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot

    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options?.modelProperties
    ) as AnthropicModelCredentials
    const optionValue = (key: keyof AnthropicModelCredentials) =>
      copilotModel.options?.[key as string] ?? modelCredentials[key]

    const thinkingEnabled = normalizeBoolean(optionValue('thinking')) ?? false
    const promptCaching = {
      messageFlowThreshold: normalizeInteger(optionValue('prompt_caching_message_flow')) ?? 0,
      cacheSystemMessage: normalizeBoolean(optionValue('prompt_caching_system_message')) ?? true,
      cacheImages: normalizeBoolean(optionValue('prompt_caching_images')) ?? true,
      cacheDocuments: normalizeBoolean(optionValue('prompt_caching_documents')) ?? true,
      cacheToolDefinitions: normalizeBoolean(optionValue('prompt_caching_tool_definitions')) ?? true,
      cacheToolResults: normalizeBoolean(optionValue('prompt_caching_tool_results')) ?? true
    } satisfies AnthropicPromptCachingOptions
    const betaHeader = buildAnthropicBetaHeader({
      context1m: copilotModel.model === 'claude-sonnet-4-6' && (normalizeBoolean(optionValue('context_1m')) ?? true),
      promptCaching
    })
    const params = toCredentialKwargs(
      modelProvider.credentials as AnthropicCredentials,
      copilotModel.model,
      betaHeader
        ? {
            defaultHeaders: {
              'anthropic-beta': betaHeader
            }
          }
        : undefined
    )

    const fields = omitBy(
      {
        ...params,
        streaming: true,
        temperature: thinkingEnabled ? undefined : normalizeNumber(optionValue('temperature')),
        maxTokens: normalizeInteger(optionValue('max_tokens')),
        topK: thinkingEnabled ? undefined : normalizeInteger(optionValue('top_k')),
        topP: thinkingEnabled ? undefined : normalizeNumber(optionValue('top_p')),
        thinking: buildAnthropicThinkingConfig(thinkingEnabled, normalizeInteger(optionValue('thinking_budget'))),
        promptCaching,
        verbose: options?.verbose
      },
      isNil
    )

    return this.createChatModel({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          params.model || params.modelName || copilotModel.model,
          modelCredentials,
          handleLLMTokens,
          {
            context: { inputTokensIncludeCache: false },
            resolveContext: getAnthropicPricingContext
          }
        ),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ]
    })
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, any>
  ): AIModelEntity | null {
    const rules: any[] = [
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        use_template: 'temperature',
        label: {
          zh_Hans: '温度',
          en_US: 'Temperature'
        },
        default: 1,
        min: 0,
        max: 1
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        use_template: 'top_p',
        label: {
          zh_Hans: 'Top P',
          en_US: 'Top P'
        },
        default: 1,
        min: 0,
        max: 1
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        use_template: 'max_tokens',
        min: 1,
        max: credentials['context_size'] ? parseInt(credentials['context_size'], 10) : 4096,
        default: 4096,
        label: {
          zh_Hans: '最大生成长度',
          en_US: 'Max Tokens'
        }
      }
    ]

    const features: ModelFeature[] = []
    const functionCallingType = credentials['function_calling_type'] ?? 'tool_call'
    if (functionCallingType === 'tool_call') {
      features.push(ModelFeature.TOOL_CALL)
    }

    const visionSupport = credentials['vision_support'] ?? 'support'
    if (visionSupport === 'support') {
      features.push(ModelFeature.VISION)
    }

    const contextSize = credentials['context_size'] ? parseInt(credentials['context_size'], 10) : 200000

    let label = {
      zh_Hans: model,
      en_US: model
    }

    if (credentials['display_name'] && credentials['display_name'] !== '') {
      label = {
        en_US: credentials['display_name'],
        zh_Hans: credentials['display_name']
      }
    }

    return {
      model,
      label,
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      model_type: AiModelTypeEnum.LLM,
      features: features,
      model_properties: {
        [ModelPropertyKey.CONTEXT_SIZE]: contextSize
      },
      parameter_rules: rules
    }
  }
}
