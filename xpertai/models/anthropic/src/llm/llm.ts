import { ChatAnthropic } from '@langchain/anthropic'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@metad/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { AnthropicModelCredentials, toCredentialKwargs } from '../types.js'
import { AnthropicProviderStrategy } from '../provider.strategy.js'

@Injectable()
export class AnthropicLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(AnthropicLargeLanguageModel.name)

  constructor(modelProvider: AnthropicProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(
    model: string,
    credentials: AnthropicModelCredentials
  ): Promise<void> {
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

  protected createChatModel(params: Parameters<typeof ChatAnthropic>[0]) {
    return new ChatAnthropic(params)
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions,
    credentials?: AnthropicModelCredentials
  ) {
    const { copilot } = copilotModel
    const { handleLLMTokens } = options ?? {}

    credentials ??= options?.modelProperties as AnthropicModelCredentials
    const params = toCredentialKwargs(credentials, copilotModel.model)

    // Handle streaming: convert string to boolean if needed
    const streamingValue = copilotModel.options?.['streaming']
    let streaming: boolean
    if (streamingValue !== undefined) {
      streaming = streamingValue === true || streamingValue === 'true' || streamingValue === 'supported'
    } else {
      streaming = credentials.streaming === true || credentials.streaming === 'supported' || true
    }

    const fields = {
      ...params,
      streaming,
      temperature: copilotModel.options?.['temperature'] ?? credentials.temperature ?? 1,
      maxTokens: copilotModel.options?.['max_tokens']
        ? parseInt(copilotModel.options?.['max_tokens'] as string, 10)
        : params.maxTokens,
      topP: copilotModel.options?.['top_p'] ?? credentials.top_p,
      verbose: options?.verbose
    }

    return this.createChatModel({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, params.modelName, credentials, handleLLMTokens),
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

    const contextSize = credentials['context_size']
      ? parseInt(credentials['context_size'], 10)
      : 200000

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

