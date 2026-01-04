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
  ChatOAICompatReasoningModel,
  CredentialsValidateFailedError,
  getErrorMessage,
  LargeLanguageModel,
  TChatModelOptions
} from '@xpert-ai/plugin-sdk'
import { isNil, omitBy } from 'lodash-es'
import { VLLMProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, VLLMModelCredentials } from '../types.js'
import { translate } from '../i18n.js'

@Injectable()
export class VLLMLargeLanguageModel extends LargeLanguageModel {
  readonly #logger = new Logger(VLLMLargeLanguageModel.name)

  constructor(modelProvider: VLLMProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.LLM)
  }

  async validateCredentials(model: string, credentials: VLLMModelCredentials): Promise<void> {
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
    const { handleLLMTokens, modelProperties } = options ?? {}
    const { copilot } = copilotModel
    if (!modelProperties) {
      throw new Error(
        translate('Error.ModelCredentialsMissing', {model: copilotModel.model})
      )
    }
    const params = toCredentialKwargs(modelProperties as VLLMModelCredentials, copilotModel.model)
    
    // Get thinking parameter from model options (runtime parameter)
    // This takes priority over the default value in credentials
    const modelOptions = copilotModel.options as Record<string, any>
    const thinking = modelOptions?.thinking ?? modelProperties?.thinking ?? false
    
    // Merge modelKwargs with thinking parameter
    // Ensure chat_template_kwargs structure is correct for vLLM API
    const existingModelKwargs = (params.modelKwargs || {}) as Record<string, any>
    const existingChatTemplateKwargs = existingModelKwargs.chat_template_kwargs || {}
    const modelKwargs = {
      ...existingModelKwargs,
      chat_template_kwargs: {
        ...existingChatTemplateKwargs,
        enable_thinking: !!thinking
      }
    }
    
    const fields = omitBy(
      {
        ...params,
        modelKwargs,
        streaming: copilotModel.options?.['streaming'] ?? true,
        // include token usage in the stream. this will include an additional chunk at the end of the stream with the token usage.
        streamUsage: true
      },
      isNil
    )
    return new ChatOAICompatReasoningModel({
      ...fields,
      verbose: options?.verbose,
      callbacks: [
        ...this.createHandleUsageCallbacks(copilot, params.model, modelProperties, handleLLMTokens),
        this.createHandleLLMErrorCallbacks(fields, this.#logger)
      ]
    })
  }

  /**
   * Generate model schema from credentials for customizable models
   * This method dynamically generates parameter rules including thinking mode
   * Merges parent class parameter rules (streaming, temperature, etc.) with thinking mode
   */
  override getCustomizableModelSchemaFromCredentials(
    model: string,
    credentials: Record<string, any>
  ): AIModelEntity | null {
    // Get parent class parameter rules (streaming and temperature)
    // This ensures we include common parameters from the base class
    const parentSchema = super.getCustomizableModelSchemaFromCredentials(model, credentials)
    const parentRules = parentSchema?.parameter_rules || []

    // Add thinking mode parameter
    // This parameter enables thinking mode for models deployed on vLLM and SGLang
    const thinkingRule = {
      name: 'thinking',
      type: ParameterType.BOOLEAN,
      label: {
        zh_Hans: '思考模式',
        en_US: 'Thinking Mode'
      },
      help: {
        zh_Hans: '是否启用思考模式',
        en_US: 'Enable thinking mode'
      },
      required: false,
      default: credentials['thinking'] ?? false
    }

    // Merge parent rules with thinking rule
    // Filter out any duplicate rules by name to ensure thinking rule takes precedence
    const rules = [
      ...parentRules,
      thinkingRule
    ].filter((rule, index, self) =>
      index === self.findIndex(r => r.name === rule.name)
    )

    // Determine completion type from credentials
    let completionType = 'chat'
    if (credentials['mode']) {
      if (credentials['mode'] === 'chat') {
        completionType = 'chat'
      } else if (credentials['mode'] === 'completion') {
        completionType = 'completion'
      }
    }

    // Build features array based on credentials
    const features: ModelFeature[] = []
    
    // Check function calling support
    const functionCallingType = credentials['function_calling_type']
    if (functionCallingType === 'function_call' || functionCallingType === 'tool_call') {
      features.push(ModelFeature.TOOL_CALL)
    }

    // Check vision support
    const visionSupport = credentials['vision_support']
    if (visionSupport === 'support') {
      features.push(ModelFeature.VISION)
    }

    // Check agent thought support
    const agentThoughtSupport = credentials['agent_though_support']
    if (agentThoughtSupport === 'supported') {
      features.push(ModelFeature.AGENT_THOUGHT)
    }

    // Get context size from credentials
    const contextSize = credentials['context_size'] 
      ? parseInt(String(credentials['context_size']), 10) 
      : 4096

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
        [ModelPropertyKey.CONTEXT_SIZE]: contextSize
      },
      parameter_rules: rules,
      pricing: parentSchema?.pricing || {
        input: credentials['input_price'] ?? 0,
        output: credentials['output_price'] ?? 0,
        unit: credentials['unit'] ?? 0,
        currency: credentials['currency'] ?? 'USD'
      }
    }
  }
}
