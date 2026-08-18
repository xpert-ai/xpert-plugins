import { ChatOpenAIFields } from '@langchain/openai'
import { LLMResult } from '@langchain/core/outputs'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  mergeCredentials,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { OpenRouterProviderStrategy } from '../provider.strategy.js'
import {
  OpenRouterModelCredentials,
  OpenRouterReasoningEffort,
  OpenRouterResponseFormat,
  toCredentialKwargs
} from '../types.js'

export type OpenRouterRuntimeOptions = Record<string, unknown>

type OpenRouterReasoning = {
  enabled?: boolean
  exclude?: boolean
  max_tokens?: number
  effort?: OpenRouterReasoningEffort
}

/** OpenRouter calls the reasoning stream field `reasoning`, unlike OpenAI's `reasoning_content`. */
class OpenRouterChatModel extends ChatOAICompatReasoningModel {
  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, any>,
    rawResponse: any,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ) {
    if (delta.reasoning != null && delta.reasoning_content == null) {
      delta = { ...delta, reasoning_content: delta.reasoning }
    }
    return super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
  }

  protected override _convertCompletionsMessageToBaseMessage(message: any, rawResponse: any) {
    if (message.reasoning != null && message.reasoning_content == null) {
      message = { ...message, reasoning_content: message.reasoning }
    }
    return super._convertCompletionsMessageToBaseMessage(message, rawResponse)
  }
}

@Injectable()
export class OpenRouterLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(OpenRouterLargeLanguageModel.name)

  constructor(modelProvider: OpenRouterProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(
    model: string,
    credentials: OpenRouterModelCredentials
  ): Promise<void> {
    try {
      const params = toCredentialKwargs(credentials, model)
      const runtime = buildOpenRouterRuntimeOptions(credentials, credentials)
      const chatModel = this.createChatModel({
        ...params,
        ...toChatModelFields(runtime),
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

  protected createChatModel(fields: ChatOpenAIFields) {
    return new OpenRouterChatModel(fields)
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions
  ) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot

    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options?.modelProperties
    ) as OpenRouterModelCredentials
    const runtimeOptions = {
      ...modelCredentials,
      ...(copilotModel.options ?? {})
    }
    const params = toCredentialKwargs(modelCredentials, copilotModel.model)
    const fields = {
      ...params,
      ...toChatModelFields(runtimeOptions),
      streaming: runtimeOptions.streaming !== false,
      streamUsage: true,
      verbose: options?.verbose
    }

    return this.createChatModel({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(
          copilot,
          params.model,
          modelCredentials,
          handleLLMTokens,
          {
            resolveReportedPrice: getOpenRouterReportedPrice,
            reportedPriceRequired: true
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
    const contextSize = toPositiveInteger(credentials.context_size) ?? 4096
    const configuredMaxTokens = toPositiveInteger(credentials.max_tokens_to_sample)
    const maxTokens = Math.max(1, Math.min(configuredMaxTokens ?? 4096, contextSize))
    const parameterRules: any[] = [
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        use_template: 'temperature',
        required: false,
        min: 0,
        max: 2,
        label: { zh_Hans: '温度', en_US: 'Temperature' }
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        use_template: 'top_p',
        required: false,
        min: 0,
        max: 1,
        label: { zh_Hans: 'Top P', en_US: 'Top P' }
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        use_template: 'max_tokens',
        required: false,
        min: 1,
        max: contextSize,
        default: maxTokens,
        label: { zh_Hans: '最大生成长度', en_US: 'Max Tokens' }
      },
      {
        name: 'frequency_penalty',
        type: ParameterType.FLOAT,
        required: false,
        min: -2,
        max: 2,
        label: { zh_Hans: '频率惩罚', en_US: 'Frequency Penalty' }
      },
      {
        name: 'presence_penalty',
        type: ParameterType.FLOAT,
        required: false,
        min: -2,
        max: 2,
        label: { zh_Hans: '存在惩罚', en_US: 'Presence Penalty' }
      },
      {
        name: 'verbosity',
        type: ParameterType.STRING,
        required: false,
        options: ['low', 'medium', 'high'],
        label: { zh_Hans: '输出详细程度', en_US: 'Verbosity' }
      }
    ]

    const features: ModelFeature[] = []
    if ((credentials.function_calling_type ?? 'no_call') === 'tool_call') {
      features.push(ModelFeature.TOOL_CALL)
    }
    if ((credentials.vision_support ?? 'no_support') === 'support') {
      features.push(ModelFeature.VISION)
    }
    if ((credentials.reasoning_support ?? 'no_support') === 'support') {
      features.push(ModelFeature.AGENT_THOUGHT)
      parameterRules.push(
        {
          name: 'reasoning_effort',
          type: ParameterType.STRING,
          required: false,
          options: ['max', 'xhigh', 'high', 'medium', 'low', 'minimal', 'none'],
          label: { zh_Hans: '推理程度', en_US: 'Reasoning Effort' }
        },
        {
          name: 'reasoning_budget',
          type: ParameterType.INT,
          required: false,
          min: 1,
          label: { zh_Hans: '思考预算', en_US: 'Reasoning Budget' }
        },
        {
          name: 'exclude_reasoning_tokens',
          type: ParameterType.BOOLEAN,
          required: false,
          default: true,
          label: { zh_Hans: '隐藏思考过程', en_US: 'Hide the thought process' }
        },
        {
          name: 'enable_thinking',
          type: ParameterType.BOOLEAN,
          required: false,
          label: { zh_Hans: '启用思考模式', en_US: 'Enable thinking' }
        }
      )
    }
    if ((credentials.structured_output_support ?? 'no_support') === 'support') {
      features.push(ModelFeature.STRUCTURED_OUTPUT)
      parameterRules.push(
        {
          name: 'response_format',
          type: ParameterType.STRING,
          required: false,
          options: ['text', 'json_object', 'json_schema'],
          label: { zh_Hans: '回复格式', en_US: 'Response Format' }
        },
        {
          name: 'json_schema',
          use_template: 'json_schema'
        }
      )
    }

    return {
      model,
      label: {
        en_US: credentials.display_name || model,
        zh_Hans: credentials.display_name || model
      },
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      model_type: AiModelTypeEnum.LLM,
      features,
      model_properties: {
        [ModelPropertyKey.MODE]: credentials.mode ?? 'chat',
        [ModelPropertyKey.CONTEXT_SIZE]: contextSize
      },
      parameter_rules: parameterRules
    }
  }
}

export function buildOpenRouterRuntimeOptions(
  credentials: OpenRouterModelCredentials,
  modelOptions: OpenRouterRuntimeOptions = {}
) {
  const get = (key: string) => modelOptions[key] ?? credentials[key as keyof OpenRouterModelCredentials]
  const modelKwargs: Record<string, unknown> = {}
  const reasoning: OpenRouterReasoning = {}

  const enabled = toBoolean(get('enable_thinking'))
  const excluded = toBoolean(get('exclude_reasoning_tokens'))
  const reasoningBudget = toPositiveInteger(get('reasoning_budget'))
  const reasoningEffort = get('reasoning_effort')

  if (enabled !== undefined) reasoning.enabled = enabled
  if (excluded !== undefined) reasoning.exclude = excluded
  if (reasoningBudget !== undefined) reasoning.max_tokens = reasoningBudget
  if (isReasoningEffort(reasoningEffort)) reasoning.effort = reasoningEffort
  if (Object.keys(reasoning).length > 0) modelKwargs.reasoning = reasoning

  const verbosity = get('verbosity')
  if (verbosity === 'low' || verbosity === 'medium' || verbosity === 'high') {
    modelKwargs.verbosity = verbosity
  }

  const responseFormat = get('response_format')
  if (isResponseFormat(responseFormat)) {
    const format = toResponseFormat(responseFormat, get('json_schema'))
    if (format) modelKwargs.response_format = format
  }

  const provider = get('provider')
  const providerOptions = isRecord(provider) ? { ...provider } : {}
  providerOptions.data_collection ??= 'allow'
  modelKwargs.provider = providerOptions

  return modelKwargs
}

function toChatModelFields(options: OpenRouterRuntimeOptions) {
  const fields: Record<string, unknown> = {
    temperature: toFiniteNumber(options.temperature),
    topP: toFiniteNumber(options.top_p),
    maxTokens: toPositiveInteger(options.max_tokens ?? options.max_tokens_to_sample),
    frequencyPenalty: toFiniteNumber(options.frequency_penalty),
    presencePenalty: toFiniteNumber(options.presence_penalty),
    maxRetries: toPositiveInteger(options.maxRetries),
    modelKwargs: buildOpenRouterRuntimeOptions(options as OpenRouterModelCredentials, options)
  }

  return omitUndefined(fields)
}

function toResponseFormat(
  format: OpenRouterResponseFormat,
  rawSchema: unknown
): Record<string, unknown> | undefined {
  if (format === 'text' || format === 'json_object') {
    return { type: format }
  }
  if (!isRecord(rawSchema) && typeof rawSchema !== 'string') {
    return undefined
  }

  let schemaValue: unknown = rawSchema
  if (typeof rawSchema === 'string') {
    try {
      schemaValue = JSON.parse(rawSchema)
    } catch {
      return undefined
    }
  }
  if (!isRecord(schemaValue)) return undefined

  const schema = isRecord(schemaValue.schema) ? schemaValue.schema : schemaValue
  return {
    type: 'json_schema',
    json_schema: {
      name: typeof schemaValue.name === 'string' ? schemaValue.name : 'output',
      schema,
      ...(typeof schemaValue.description === 'string' ? { description: schemaValue.description } : {}),
      ...(typeof schemaValue.strict === 'boolean' ? { strict: schemaValue.strict } : {})
    }
  }
}

function isResponseFormat(value: unknown): value is OpenRouterResponseFormat {
  return value === 'text' || value === 'json_object' || value === 'json_schema'
}

function isReasoningEffort(value: unknown): value is OpenRouterReasoningEffort {
  return value === 'max' || value === 'xhigh' || value === 'high' || value === 'medium' || value === 'low' || value === 'minimal' || value === 'none'
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toBoolean(value: unknown): boolean | undefined {
  if (value === true || value === 'true' || value === 1 || value === '1' || value === 'manual') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return undefined
}

function toFiniteNumber(value: unknown): number | undefined {
  if (value === '' || value == null) return undefined
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toPositiveInteger(value: unknown): number | undefined {
  const number = toFiniteNumber(value)
  return number !== undefined && number > 0 ? Math.trunc(number) : undefined
}

function omitUndefined(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

export function getOpenRouterReportedPrice(output: LLMResult) {
  const usageCandidates = [
    output.llmOutput?.['usage'],
    ...(output.generations ?? [])
      .flat()
      .map(readGenerationUsage)
  ]

  for (const usage of usageCandidates) {
    if (!isRecord(usage)) continue
    const amount = Number(usage['cost'])
    if (Number.isFinite(amount) && amount >= 0) {
      return { amount, currency: 'USD' }
    }
  }

  return undefined
}

function readGenerationUsage(
  generation: LLMResult['generations'][number][number]
) {
  if (!isRecord(generation) || !isRecord(generation['message'])) {
    return undefined
  }
  const responseMetadata = generation['message']['response_metadata']
  return isRecord(responseMetadata) ? responseMetadata['usage'] : undefined
}
