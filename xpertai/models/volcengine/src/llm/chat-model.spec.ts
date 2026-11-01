import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { ArkReasoningChatModel } from './chat-model.js'

function completion() {
  return { id: 'reply', object: 'chat.completion', created: 1, model: 'test',
    choices: [{ index: 0, finish_reason: 'stop', message: {
      role: 'assistant', content: 'answer', reasoning_content: 'new reasoning', encrypted_content: 'opaque-ciphertext'
    } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } }
}

describe('volcengine reasoning history transport', () => {
  afterEach(() => jest.restoreAllMocks())

  it('forwards assistant reasoning in concurrent tool continuations without changing the source messages', async () => {
    const bodies: { messages: { role: string; reasoning_content?: string; encrypted_content?: string }[] }[] = []
    const fetchMock = jest.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify(completion()), { headers: { 'Content-Type': 'application/json' } })
    })
    const model = new ArkReasoningChatModel({ apiKey: 'test-key', model: 'test', streaming: false,
      maxRetries: 0, configuration: { fetch: fetchMock } })
    const histories = ['first', 'second'].map((text) => [new HumanMessage('question'),
      new AIMessage({ content: '', additional_kwargs: { reasoning_content: text, encrypted_content: text + '-encrypted' },
        tool_calls: [{ id: text, name: 'lookup', args: {} }] }),
      new ToolMessage({ content: 'result', tool_call_id: text })])
    const replies = await Promise.all(histories.map((messages) => model.invoke(messages)))
    expect(bodies.map((body) => body.messages.find((message) => message.role === 'assistant')?.reasoning_content).sort())
      .toEqual(['first', 'second'])
    expect(bodies.map((body) => body.messages.find((message) => message.role === 'assistant')?.encrypted_content).sort())
      .toEqual(['first-encrypted', 'second-encrypted'])
    expect(replies[0].additional_kwargs.encrypted_content).toBe('opaque-ciphertext')
    expect(replies[0].additional_kwargs.reasoning_content).toBe('new reasoning')
    expect(histories[0][1].additional_kwargs.reasoning_content).toBe('first')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves reasoning through streaming responses and the next streamed request', async () => {
    const bodies: { messages: { role: string; reasoning_content?: string; encrypted_content?: string }[] }[] = []
    const fetchMock = jest.fn(async (_input, init) => {
      bodies.push(JSON.parse(String(init.body)))
      const chunks = [
        { role: 'assistant', reasoning_content: 'thought', encrypted_content: 'cipher' },
        { content: 'answer', reasoning_content: null, encrypted_content: null }
      ].map((delta) => 'data: ' + JSON.stringify({ id: 'stream', object: 'chat.completion.chunk', created: 1,
        model: 'test', choices: [{ index: 0, delta, finish_reason: null }] }) + '\n\n').join('')
      return new Response(chunks + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const model = new ArkReasoningChatModel({ apiKey: 'test-key', model: 'test', maxRetries: 0,
      configuration: { fetch: fetchMock } })
    const chunks = []
    for await (const chunk of await model.stream([new HumanMessage('start')])) chunks.push(chunk)
    const reply = chunks.reduce((all, chunk) => all ? all.concat(chunk) : chunk)
    expect(reply.additional_kwargs.reasoning_content).toBe('thought')
    expect(reply.additional_kwargs.encrypted_content).toBe('cipher')
    for await (const chunk of await model.stream([new HumanMessage('start'), reply, new HumanMessage('continue')])) {
      void chunk
    }
    expect(bodies[1].messages[1].reasoning_content).toBe('thought')
    expect(bodies[1].messages[1].encrypted_content).toBe('cipher')
  })
})
