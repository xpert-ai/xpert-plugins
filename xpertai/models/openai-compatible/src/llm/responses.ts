import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager'
import type { BaseMessage } from '@langchain/core/messages'
import { ChatOpenAIResponses, type OpenAIClient } from '@langchain/openai'

type Event = OpenAIClient.Responses.ResponseStreamEvent

// Some compatible servers send full arguments only in the done event. LangChain
// 0.6.9 consumes argument deltas only. Repair missing suffixes per request, while
// rejecting inconsistent streams and requiring a successful terminal response.
export async function* completeResponseArguments(events: AsyncIterable<Event>): AsyncGenerator<Event> {
  const calls = new Map<number, { id: string; arguments: string }>()
  let completed = false
  for await (const event of events) {
    if (event.type === 'response.output_item.added' && event.item.type === 'function_call') {
      if (!event.item.id) throw new Error('Missing Responses tool item ID')
      if (calls.has(event.output_index)) throw new Error('Duplicate Responses tool item')
      calls.set(event.output_index, { id: event.item.id, arguments: event.item.arguments })
    } else if (event.type === 'response.function_call_arguments.delta') {
      const call = calls.get(event.output_index)
      if (!call || call.id !== event.item_id) throw new Error('Unknown Responses tool item')
      call.arguments += event.delta
    } else if (event.type === 'response.function_call_arguments.done' ||
      (event.type === 'response.output_item.done' && event.item.type === 'function_call')) {
      let item: { id: string; arguments: string }
      if (event.type === 'response.function_call_arguments.done')
        item = { id: event.item_id, arguments: event.arguments }
      else if (event.item.type === 'function_call') item = { id: event.item.id, arguments: event.item.arguments }
      else throw new Error('Invalid Responses tool item')
      const call = calls.get(event.output_index)
      if (!call || call.id !== item.id || !item.arguments.startsWith(call.arguments))
        throw new Error('Inconsistent Responses tool arguments')
      JSON.parse(item.arguments)
      const delta = item.arguments.slice(call.arguments.length)
      call.arguments = item.arguments
      if (delta) yield {
        type: 'response.function_call_arguments.delta', item_id: call.id,
        output_index: event.output_index, sequence_number: event.sequence_number, delta
      }
    } else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
      throw new Error(`Responses stream did not complete: ${event.type}`)
    } else if (event.type === 'response.completed') {
      if (event.response.status !== 'completed' || event.response.error)
        throw new Error('Responses stream did not complete successfully')
      completed = true
    }
    yield event
  }
  if (!completed) throw new Error('Responses stream closed without a completed response')
}

export class CompatibleResponsesChatModel extends ChatOpenAIResponses {
  override async *_streamResponseChunks(
    messages: BaseMessage[], options: this['ParsedCallOptions'], runManager?: CallbackManagerForLLMRun
  ) {
    const events = await this.completionWithRetry({
      ...this.invocationParams(options), input: this._convertMessagesToResponsesParams(messages), stream: true
    }, options)
    for await (const event of completeResponseArguments(events)) {
      const chunk = this._convertResponsesDeltaToBaseMessageChunk(event)
      if (!chunk) continue
      yield chunk
      await runManager?.handleLLMNewToken(chunk.text || '', {
        prompt: options.promptIndex ?? 0, completion: 0
      }, undefined, undefined, undefined, { chunk })
    }
  }
}
