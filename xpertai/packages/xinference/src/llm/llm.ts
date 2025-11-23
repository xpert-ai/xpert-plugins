import { ChatOpenAI } from '@langchain/openai'
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
  mergeCredentials,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { translate } from '../i18n.js'
import { XinferenceProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, XinferenceModelCredentials } from '../types.js'

@Injectable()
export class XinferenceLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(XinferenceLargeLanguageModel.name)

  constructor(modelProvider: XinferenceProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: XinferenceModelCredentials): Promise<void> {
    try {
      const chatModel = new ChatOpenAI({
        ...toCredentialKwargs(credentials, model),
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

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions) {
    const { handleLLMTokens } = options ?? {}
    const { copilot } = copilotModel
    const { modelProvider } = copilot
    if (!options?.modelProperties) {
      throw new Error(translate('Error.ModelCredentialsMissing', { model: copilotModel.model }))
    }
    const modelCredentials = mergeCredentials(
      modelProvider.credentials,
      options.modelProperties
    ) as XinferenceModelCredentials
    const params = toCredentialKwargs(modelCredentials, copilotModel.model)

    const fields = {
      ...params,
      streaming: true,
      maxRetries: modelCredentials?.max_retries,
      streamUsage: false,
      verbose: options?.verbose
    }
    return new ChatOpenAI({
      ...fields,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, params.model, modelCredentials, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ]
    })
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, any>
  ): AIModelEntity | null {
    const rules = [
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
    const contextLength = credentials['context_length'] ?? 2048

    return {
      model,
      label: {
        zh_Hans: model,
        en_US: model
      },
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
