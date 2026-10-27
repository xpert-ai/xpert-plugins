import { AsyncLocalStorage } from 'node:async_hooks'
import type { BaseMessage } from '@langchain/core/messages'
import { isAIMessage, SystemMessage } from '@langchain/core/messages'
import type { BaseLanguageModelInput, StructuredOutputMethodOptions } from '@langchain/core/language_models/base'
import { Runnable, RunnableLambda, RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables'
import { toJsonSchema } from '@langchain/core/utils/json_schema'
import { isInteropZodSchema, type InteropZodType } from '@langchain/core/utils/types'
import type { OpenAIClient } from '@langchain/openai'
import { ChatOAICompatReasoningModel } from '@xpert-ai/plugin-sdk'
import { getTongyiStructuredToolChoice } from './model-options.js'
import { TongyiStructuredOutputParser } from './structured-output-parser.js'

// LangChain 0.6 drops provider reasoning fields during request conversion.
// Invocation-local history must survive the different streaming/non-streaming options conversions.
export class TongyiReasoningChatModel extends ChatOAICompatReasoningModel {
  private readonly histories = new AsyncLocalStorage<BaseMessage[]>()

  override withStructuredOutput<RunOutput extends object = Record<string, unknown>>(
    schema: InteropZodType<RunOutput> | Record<string, unknown>, config?: StructuredOutputMethodOptions<false>
  ): Runnable<BaseLanguageModelInput, RunOutput>
  override withStructuredOutput<RunOutput extends object = Record<string, unknown>>(
    schema: InteropZodType<RunOutput> | Record<string, unknown>, config?: StructuredOutputMethodOptions<true>
  ): Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: RunOutput }>
  override withStructuredOutput<RunOutput extends object = Record<string, unknown>>(
    schema: InteropZodType<RunOutput> | Record<string, unknown>, config?: StructuredOutputMethodOptions<boolean>
  ): Runnable<BaseLanguageModelInput, RunOutput> | Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: RunOutput }>
  override withStructuredOutput<RunOutput extends object = Record<string, unknown>>(
    schema: InteropZodType<RunOutput> | Record<string, unknown>, config?: StructuredOutputMethodOptions<boolean>
  ): Runnable<BaseLanguageModelInput, RunOutput> | Runnable<BaseLanguageModelInput, { raw: BaseMessage; parsed: RunOutput }> {
    const choice = getTongyiStructuredToolChoice(this.model)
    if (!choice || (config?.method && config.method !== 'functionCalling')) {
      return super.withStructuredOutput<RunOutput>(schema, config)
    }
    if (config?.strict === true) {
      throw new Error(`${this.model}: strict tool calling is unsupported; structured output is validated locally`)
    }

    const zodSchema = isInteropZodSchema(schema) ? schema : undefined
    const jsonSchema = isInteropZodSchema(schema) ? toJsonSchema(schema) : schema
    const definition = 'name' in jsonSchema && typeof jsonSchema.name === 'string' &&
      'parameters' in jsonSchema && typeof jsonSchema.parameters === 'object' && jsonSchema.parameters !== null &&
      !Array.isArray(jsonSchema.parameters)
      ? { name: jsonSchema.name, parameters: jsonSchema.parameters } : undefined
    const name = definition?.name ?? config?.name ?? (typeof jsonSchema.title === 'string' ? jsonSchema.title : 'extract')
    const parameters = definition?.parameters ?? jsonSchema
    const description = typeof jsonSchema.description === 'string' ? jsonSchema.description : 'Return the structured result'
    const parser = new TongyiStructuredOutputParser<RunOutput>({ keyName: name, returnSingle: true, zodSchema }, parameters)
    // These providers cannot force a tool. Request it in the prompt and reject missing/invalid results locally.
    const prepare = RunnableLambda.from((input: BaseLanguageModelInput) => [
      new SystemMessage(`Return the final result by calling the ${name} tool with arguments matching its schema.`),
      ...TongyiReasoningChatModel._convertInputToPromptValue(input).toChatMessages()
    ])
    const llm = prepare.pipe(this.withConfig({
      tools: [{ type: 'function', function: { name, description, parameters } }],
      ...(choice === 'auto' ? { tool_choice: 'auto' } : {}),
      ls_structured_output_format: { kwargs: { method: 'function_calling' }, schema: { title: name, ...parameters } }
    }))
    // Buffer streamed tool arguments until the complete result can be validated.
    if (!config?.includeRaw) return llm.pipe(RunnableLambda.from((message, options) => parser.invoke(message, options)))
    const parsed = RunnablePassthrough.assign({
      parsed: (input: { raw: BaseMessage }, options) => parser.invoke(input.raw, options)
    }).withFallbacks({ fallbacks: [RunnablePassthrough.assign({ parsed: () => null })] })
    return RunnableSequence.from([{ raw: llm }, parsed])
  }

  override async _generate(...args: Parameters<ChatOAICompatReasoningModel['_generate']>) {
    return this.histories.run(args[0], () => super._generate(...args))
  }

  override async *_streamResponseChunks(...args: Parameters<ChatOAICompatReasoningModel['_streamResponseChunks']>) {
    const stream = super._streamResponseChunks(...args)
    try {
      while (true) {
        const next = await this.histories.run(args[0], () => stream.next())
        if (next.done) return
        yield next.value
      }
    } finally {
      await this.histories.run(args[0], () => stream.return(undefined))
    }
  }

  override completionWithRetry(request: OpenAIClient.ChatCompletionCreateParamsStreaming,
    options?: OpenAIClient.RequestOptions): Promise<AsyncIterable<OpenAIClient.ChatCompletionChunk>>
  override completionWithRetry(request: OpenAIClient.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAIClient.RequestOptions): Promise<OpenAIClient.ChatCompletion>
  override completionWithRetry(
    request: OpenAIClient.ChatCompletionCreateParamsStreaming | OpenAIClient.ChatCompletionCreateParamsNonStreaming,
    options?: OpenAIClient.RequestOptions
  ): Promise<AsyncIterable<OpenAIClient.ChatCompletionChunk> | OpenAIClient.ChatCompletion> {
    const history = this.histories.getStore()
    const assistants = history?.filter(isAIMessage) ?? []
    let index = 0
    const messages = request.messages.map((message) => {
      // LangChain may emit a separate assistant audio-reference message after its content message.
      if (message.role !== 'assistant' || (!('content' in message) && message.audio)) return message
      const original = assistants[index++]
      if (!original) return message
      const reasoning = original.additional_kwargs.reasoning_content
      return { ...message,
        ...(typeof reasoning === 'string' ? { reasoning_content: reasoning } : {})
      }
    })
    return request.stream
      ? super.completionWithRetry({ ...request, messages, stream: true }, options)
      : super.completionWithRetry({ ...request, messages, stream: false }, options)
  }

  protected override _convertCompletionsDeltaToBaseMessageChunk(
    ...args: Parameters<ChatOAICompatReasoningModel['_convertCompletionsDeltaToBaseMessageChunk']>
  ) {
    const chunk = super._convertCompletionsDeltaToBaseMessageChunk(...args)
    if (typeof chunk.additional_kwargs.reasoning_content !== 'string') delete chunk.additional_kwargs.reasoning_content
    return chunk
  }
}
