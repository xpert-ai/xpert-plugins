import { ChatOpenAI, OpenAIClient } from '@langchain/openai'
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
import { AIMessage, AIMessageChunk, BaseMessage, isAIMessage } from '@langchain/core/messages'
import { ChatGenerationChunk } from '@langchain/core/outputs'
import { isNil, omitBy } from 'lodash-es'
import { VLLMProviderStrategy } from '../provider.strategy.js'
import { toCredentialKwargs, VLLMModelCredentials } from '../types.js'
import { translate } from '../i18n.js'

/**
 * Extract reasoning content from redacted_reasoning tags in vLLM response
 * vLLM returns thinking content in format: ...content...</think>final answer
 * The tag format is: </think> (closing tag only, opening tag is implicit)
 */
function extractReasoningFromContent(content: string): { reasoning: string | null; finalContent: string } {
  // vLLM uses </think> as the closing tag
  // The thinking content is everything before this tag, final answer is after
  const tagIndex = content.indexOf('</think>')
  
  if (tagIndex !== -1) {
    // Extract reasoning content (everything before the closing tag)
    const reasoning = content.substring(0, tagIndex).trim()
    // Extract final content (everything after the closing tag)
    const finalContent = content.substring(tagIndex + '</think>'.length).trim()
    return { reasoning, finalContent }
  }
  
  return { reasoning: null, finalContent: content }
}

/**
 * vLLM-specific chat model that extracts reasoning content from redacted_reasoning tags
 * and sets it in additional_kwargs.reasoning_content for proper display
 * Key fix: Override _convertCompletionsDeltaToBaseMessageChunk to handle tags in delta content
 * This ensures reasoning chunks have empty content, so platform code can recognize reasoning type
 */
class VLLMChatOAICompatReasoningModel extends ChatOAICompatReasoningModel {
  // Track accumulated reasoning content across chunks
  private accumulatedReasoning: string = ''
  private finalReasoningContent: string | null = null // Store final reasoning content after tag found
  private inReasoningMode: boolean = true // Start in reasoning mode for vLLM thinking mode
  private reasoningComplete: boolean = false // Track if reasoning phase is complete
  /**
   * Override _convertCompletionsDeltaToBaseMessageChunk to handle vLLM's tag format
   * This is the key fix: process tags at delta conversion stage, not in streaming
   * vLLM format: "推理内容</think>正常回复" (tag mixed with content)
   * Platform logic: if content exists, return type: "text" (only checks reasoning_content if content is empty)
   * Solution: set content to empty for reasoning chunks, populate reasoning_content
   */
  protected override _convertCompletionsDeltaToBaseMessageChunk(
    delta: Record<string, any>,
    rawResponse: OpenAIClient.ChatCompletionChunk,
    defaultRole?: 'function' | 'user' | 'system' | 'developer' | 'assistant' | 'tool'
  ): AIMessageChunk {
    // Call parent method first to get base message chunk
    const messageChunk = super._convertCompletionsDeltaToBaseMessageChunk(delta, rawResponse, defaultRole)
    
    // Initialize additional_kwargs if not present
    if (!messageChunk.additional_kwargs) {
      messageChunk.additional_kwargs = {}
    }
    
    // Check if delta has standard reasoning_content field (like DeepSeek)
    if (delta['reasoning_content']) {
      messageChunk.additional_kwargs['reasoning_content'] = delta['reasoning_content']
      // For standard format, keep content as is
      return messageChunk
    }
    
    // Handle vLLM's tag format: content contains tags mixed with text
    const content = messageChunk.content as string
    
    // If no content in this delta, return as is
    if (!content || typeof content !== 'string') {
      return messageChunk
    }
    
    // Check if content contains closing tag: "</think>"
    // vLLM format: "推理内容</think>正常回复"
    if (content.includes('</think>')) {
      const parts = content.split('</think>')
      
      // Content before closing tag is reasoning
      if (parts[0]) {
        this.accumulatedReasoning += parts[0]
      }
      
      // Save final reasoning content before resetting
      this.finalReasoningContent = this.accumulatedReasoning
      
      // Set reasoning content in additional_kwargs
      messageChunk.additional_kwargs['reasoning_content'] = this.finalReasoningContent
      
      // Mark reasoning as complete
      this.reasoningComplete = true
      this.inReasoningMode = false
      
      // Content after closing tag is normal content
      // Set content to final answer part (empty if no final content yet)
      messageChunk.content = parts[1] || ''
      
      // Reset accumulated reasoning for next message
      this.accumulatedReasoning = ''
      
      return messageChunk
    }
    
    // If reasoning is complete, this is normal content
    if (this.reasoningComplete) {
      // Keep content as is, but ensure reasoning_content is set from saved final reasoning
      if (this.finalReasoningContent && !messageChunk.additional_kwargs['reasoning_content']) {
        messageChunk.additional_kwargs['reasoning_content'] = this.finalReasoningContent
      }
      return messageChunk
    }
    
    // If still in reasoning mode (before tag found), accumulate reasoning content
    if (this.inReasoningMode) {
      // Only pass the current delta content, not accumulated content
      // This prevents duplicate reasoning content in each chunk
      // Platform code will accumulate the reasoning_content chunks on its own
      messageChunk.additional_kwargs['reasoning_content'] = content
      // Clear content so platform code recognizes this as reasoning type
      // Platform logic: if content is empty, it checks reasoning_content
      messageChunk.content = ''
      // Still accumulate for final reasoning content when tag is found
      this.accumulatedReasoning += content
      return messageChunk
    }
    
    // Fallback: return as is
    return messageChunk
  }

  /**
   * Override _convertCompletionsMessageToBaseMessage for non-streaming case
   * Handle reasoning content from tags in final message
   */
  protected override _convertCompletionsMessageToBaseMessage(
    message: OpenAIClient.ChatCompletionMessage,
    rawResponse: OpenAIClient.ChatCompletion
  ): AIMessage {
    const langChainMessage = super._convertCompletionsMessageToBaseMessage(message, rawResponse)
    
    // Initialize additional_kwargs if not present
    if (!langChainMessage.additional_kwargs) {
      langChainMessage.additional_kwargs = {}
    }
    
    // Check if message has standard reasoning_content field
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((message as any).reasoning_content) {
      langChainMessage.additional_kwargs['reasoning_content'] = (message as any).reasoning_content
      return langChainMessage
    }
    
    // Handle vLLM's tag format in non-streaming case
    if (typeof langChainMessage.content === 'string') {
      const { reasoning, finalContent } = extractReasoningFromContent(langChainMessage.content)
      
      if (reasoning) {
        // Set reasoning content in additional_kwargs
        langChainMessage.additional_kwargs['reasoning_content'] = reasoning
        // Update content to final answer only
        langChainMessage.content = finalContent
      }
    }
    
    return langChainMessage
  }

  /**
   * Override _generate to extract reasoning content from tags after generation
   * This handles non-streaming case
   */
  override async _generate(
    messages: BaseMessage[],
    options?: Parameters<ChatOAICompatReasoningModel['_generate']>[1],
    runManager?: Parameters<ChatOAICompatReasoningModel['_generate']>[2]
  ) {
    // Reset state for new generation
    this.accumulatedReasoning = ''
    this.finalReasoningContent = null
    this.inReasoningMode = true
    this.reasoningComplete = false
    
    const result = await super._generate(messages, options, runManager)
    
    // Process each generation to extract reasoning content from tags
    for (const generation of result.generations) {
      if (isAIMessage(generation.message) && typeof generation.message.content === 'string') {
        const { reasoning, finalContent } = extractReasoningFromContent(generation.message.content)
        
        if (reasoning) {
          // Update content to remove thinking tags
          generation.message.content = finalContent
          
          // Set reasoning_content in additional_kwargs
          if (!generation.message.additional_kwargs) {
            generation.message.additional_kwargs = {}
          }
          generation.message.additional_kwargs.reasoning_content = reasoning
          
          // Update text field as well
          generation.text = finalContent
        }
      }
    }
    
    return result
  }

  /**
   * Override streaming to reset state for each new stream
   * The actual tag processing is done in _convertCompletionsDeltaToBaseMessageChunk
   */
  override async *_streamResponseChunks(
    messages: BaseMessage[],
    options?: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>[1],
    runManager?: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>[2]
  ) {
    // Reset state for new stream
    this.accumulatedReasoning = ''
    this.finalReasoningContent = null
    this.inReasoningMode = true
    this.reasoningComplete = false
    
    // Let parent handle streaming, _convertCompletionsDeltaToBaseMessageChunk will process tags
    for await (const chunk of super._streamResponseChunks(messages, options, runManager)) {
      yield chunk
    }
  }
}

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
    // Use custom VLLMChatOAICompatReasoningModel to extract reasoning content from tags
    return new VLLMChatOAICompatReasoningModel({
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
