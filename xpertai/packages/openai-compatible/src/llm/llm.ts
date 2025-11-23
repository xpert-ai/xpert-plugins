import { ChatOpenAI, ChatOpenAIFields, ClientOptions } from '@langchain/openai'
import {
  AIModelEntity,
  AiModelTypeEnum,
  FetchFrom,
  ICopilotModel,
  ModelFeature,
  ModelPropertyKey,
  ParameterType
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { OpenAICompatModelCredentials, toCredentialKwargs } from '../types.js'
import { OpenAICompatibleProviderStrategy } from '../provider.strategy.js'

export type TOAIAPICompatLLMParams = ChatOpenAIFields & { configuration: ClientOptions }

@Injectable()
export class OAIAPICompatLargeLanguageModel extends LargeLanguageModel {
  constructor(modelProvider: OpenAICompatibleProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: OpenAICompatModelCredentials): Promise<void> {
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
          content: `Hi`
        }
      ])
    } catch (err) {
      throw new CredentialsValidateFailedError(getErrorMessage(err))
    }
  }

  protected createChatModel(params: TOAIAPICompatLLMParams) {
    /**
     * @todo ChatOpenAICompletions vs ChatOpenAI
     */
    return new ChatOAICompatReasoningModel(params)
  }

  override getChatModel(
    copilotModel: ICopilotModel,
    options?: TChatModelOptions,
    credentials?: OpenAICompatModelCredentials
  ) {
    const { copilot } = copilotModel
    const { handleLLMTokens } = options ?? {}

    credentials ??= options?.modelProperties as OpenAICompatModelCredentials
    const params = toCredentialKwargs(credentials, copilotModel.model)

    return this.createChatModel({
      ...params,
      streaming: copilotModel.options?.['streaming'] ?? this.canSteaming(params.model),
      temperature: copilotModel.options?.['temperature'] ?? 0,
      maxTokens: copilotModel.options?.['max_tokens'],
      streamUsage: false,
      verbose: options?.verbose,
      callbacks: [...this.createHandleUsageCallbacks(copilot, params.model, credentials, handleLLMTokens)]
    })
  }

  canSteaming(model: string) {
    return !model.startsWith('o1')
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
        }
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        use_template: 'top_p',
        label: {
          zh_Hans: 'Top P',
          en_US: 'Top P'
        }
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        use_template: 'max_tokens',
        min: 1,
        max: credentials['context_length'] ?? 2048,
        default: 512,
        label: {
          zh_Hans: '最大生成长度',
          en_US: 'Max Tokens'
        }
      },
      {
        name: 'presence_penalty',
        use_template: 'presence_penalty',
        type: ParameterType.FLOAT,
        label: {
          en_US: 'Presence Penalty',
          zh_Hans: '存在惩罚'
        },
        required: false,
        help: {
          en_US:
            "Number between -2.0 and 2.0. Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics.",
          zh_Hans:
            '介于 -2.0 和 2.0 之间的数字。正值会根据新词是否已出现在文本中对其进行惩罚，从而增加模型谈论新话题的可能性。'
        },
        default: 0.0,
        min: -2.0,
        max: 2.0,
        precision: 2
      },
      {
        name: 'frequency_penalty',
        use_template: 'frequency_penalty',
        type: ParameterType.FLOAT,
        label: {
          en_US: 'Frequency Penalty',
          zh_Hans: '频率惩罚'
        },
        required: false,
        help: {
          en_US:
            "Number between -2.0 and 2.0. Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim.",
          zh_Hans:
            '介于 -2.0 和 2.0 之间的数字。正值会根据新词在文本中的现有频率对其进行惩罚，从而降低模型逐字重复相同内容的可能性。'
        },
        default: 0.0,
        min: -2.0,
        max: 2.0,
        precision: 2
      }
    ]

    let completionType = null
    if (credentials['completion_type']) {
      if (credentials['completion_type'] === 'chat') {
        completionType = 'chat'
      } else if (credentials['completion_type'] === 'completion') {
        completionType = 'completion'
      } else {
        throw new Error(`completion_type ${credentials['completion_type']} is not supported`)
      }
    } else {
      // Default to chat if not specified, as we cannot make async calls here
      completionType = 'chat'
    }

    const features: ModelFeature[] = []
    const supportFunctionCall = credentials['support_function_call'] ?? false
    if (supportFunctionCall) {
      features.push(ModelFeature.TOOL_CALL)
    }
    const supportVision = credentials['support_vision'] ?? false
    if (supportVision) {
      features.push(ModelFeature.VISION)
    }

    const agentThoughtSupport = credentials['agent_though_support'] ?? 'not_supported'
    if (agentThoughtSupport === 'supported') {
      if (!features.includes(ModelFeature.AGENT_THOUGHT)) {
        features.push(ModelFeature.AGENT_THOUGHT)
      }
    }

    const structuredOutputSupport = credentials['structured_output_support'] ?? 'not_supported'
    if (structuredOutputSupport === 'supported') {
      // try {
      //     entity.features.index(ModelFeature.STRUCTURED_OUTPUT)
      // } catch (ValueError) {
      //     entity.features.append(ModelFeature.STRUCTURED_OUTPUT)
      // }

      rules.push({
        name: 'response_format',
        label: {
          en_US: 'Response Format',
          zh_Hans: '回复格式'
        },
        help: {
          en_US: 'Specifying the format that the model must output.',
          zh_Hans: '指定模型必须输出的格式。'
        },
        type: ParameterType.STRING,
        options: ['text', 'json_object', 'json_schema'],
        required: false
      })
      rules.push({
        name: 'json_schema',
        use_template: 'json_schema'
      })
    }

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

    rules.push({
      name: 'enable_thinking',
      label: {
        en_US: 'Thinking mode',
        zh_Hans: '思考模式'
      },
      help: {
        en_US:
          'Whether to enable thinking mode, applicable to various thinking mode models deployed on reasoning frameworks such as vLLM and SGLang, for example Qwen3.',
        zh_Hans: '是否开启思考模式，适用于vLLM和SGLang等推理框架部署的多种思考模式模型，例如Qwen3。'
      },
      type: ParameterType.BOOLEAN,
      required: false
    })

    const contextLength = credentials['context_length'] ?? 2048

    return {
      model,
      label,
      fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      model_type: AiModelTypeEnum.LLM,
      features: features,
      model_properties: {
        [ModelPropertyKey.MODE]: completionType,
        [ModelPropertyKey.CONTEXT_SIZE]: contextLength
      },
      parameter_rules: rules
    }
  }
}
