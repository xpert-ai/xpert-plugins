import { HumanMessage, isAIMessage, SystemMessage } from '@langchain/core/messages'
import { ChatPromptTemplate } from '@langchain/core/prompts'
import type { ClientOptions, OpenAIClient } from '@langchain/openai'
import { AiProviderRole } from '@xpert-ai/contracts'
import { z } from 'zod'
import { TongyiProviderStrategy } from '../provider.strategy.js'
import { TongyiLargeLanguageModel } from './llm.js'

type Fetch = NonNullable<ClientOptions['fetch']>
type Request = OpenAIClient.ChatCompletionCreateParams
type Message = OpenAIClient.ChatCompletionMessage
const MODELS = ['MiniMax/MiniMax-M3.1-Flash', 'xiaomi/mimo-v2.6-pro-ultraspeed', 'stepfun/step-5-preview']
const schema = z.object({ answer: z.string() })
const jsonSchema = { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] }

function fixture(model: string, reply?: (name: string) => Message, streaming = false) {
  const requests: Request[] = []
  const fetch = jest.fn(async (input: Parameters<Fetch>[0], init: Parameters<Fetch>[1]) => {
    expect(String(input)).toBe('https://review.invalid/compatible-mode/v1/chat/completions')
    const request: Request = JSON.parse(String(init?.body))
    requests.push(request)
    const tool = request.tools?.[0]
    if (tool?.type !== 'function') throw new Error('Expected a function tool')
    const message = reply?.(tool.function.name) ?? toolReply(tool.function.name)
    const base = { id: 'mock', created: 1, model, usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
    if (request.stream) {
      const functions = message.tool_calls?.map((call) => {
        if (call.type !== 'function') throw new Error('Expected a function tool response')
        return call
      })
      const toolCalls = functions?.map((call, index) => ({ ...call, index,
        function: { ...call.function, arguments: call.function.arguments.slice(0, 5) } }))
      const remainingCalls = functions?.map((call, index) => ({ index,
        function: { arguments: call.function.arguments.slice(5) } }))
      const chunks = [
        { ...base, object: 'chat.completion.chunk', choices: [{ index: 0,
          delta: { ...message, tool_calls: toolCalls }, finish_reason: null }] },
        { ...base, object: 'chat.completion.chunk', choices: [{ index: 0,
          delta: { tool_calls: remainingCalls }, finish_reason: 'tool_calls' }] }
      ]
      return new Response(`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, {
        headers: { 'Content-Type': 'text/event-stream' }
      })
    }
    return Response.json({ ...base, object: 'chat.completion', choices: [{ index: 0, message, finish_reason: 'tool_calls' }] })
  })
  const manager = new TongyiLargeLanguageModel(new TongyiProviderStrategy())
  const chat = manager.getChatModel({ model, options: { streaming, maxRetries: 0 }, copilot: {
    role: AiProviderRole.Primary, modelProvider: { credentials: { dashscope_api_key: 'test', api_host: 'https://review.invalid' } }
  } })
  chat.callbacks = []
  chat.clientConfig.fetch = fetch
  // LangChain estimates streaming usage with a remotely downloaded tokenizer.
  jest.spyOn(chat, 'getNumTokens').mockResolvedValue(10)
  return { chat, fetch, requests }
}

function toolReply(name: string, args = '{"answer":"ok"}'): Message {
  return { role: 'assistant', content: null, refusal: null,
    tool_calls: [{ id: 'call_mock', type: 'function', function: { name, arguments: args } }] }
}

describe('Tongyi structured output with automatic tool selection', () => {
  it.each(MODELS)('supports the platform prompt pipeline for %s', async (model) => {
    const { chat, requests } = fixture(model)
    const prompt = ChatPromptTemplate.fromMessages([['system', 'Keep the answer short'], ['human', '{question}']])
    const result = await prompt.pipe(chat.withStructuredOutput(schema, { method: 'functionCalling', name: 'answer_form' }))
      .invoke({ question: 'Hello' })
    expect(result).toEqual({ answer: 'ok' })
    expect(requests[0].tool_choice).toBe(model === 'stepfun/step-5-preview' ? undefined : 'auto')
    expect(requests[0].response_format).toBeUndefined()
    expect(requests[0].messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: 'system', content: 'Keep the answer short' }),
      expect.objectContaining({ role: 'user', content: 'Hello' })
    ]))
    expect(requests[0].tools?.[0]).toMatchObject({ function: { name: 'answer_form', parameters: jsonSchema } })
  })

  it.each(MODELS)('supports default method, streaming and includeRaw for %s', async (model) => {
    const { chat, requests } = fixture(model, undefined, true)
    const result = await chat.withStructuredOutput(schema, { includeRaw: true }).invoke('Hello')
    expect(result.parsed).toEqual({ answer: 'ok' })
    expect(isAIMessage(result.raw) && result.raw.tool_calls?.[0].name).toBe('extract')
    const outputs = []
    for await (const output of await chat.withStructuredOutput(schema).stream('Hello')) outputs.push(output)
    expect(outputs).toEqual([{ answer: 'ok' }])
    const rawOutputs = []
    for await (const output of await chat.withStructuredOutput(schema, { includeRaw: true }).stream('Hello')) {
      if ('parsed' in output) rawOutputs.push(output.parsed)
    }
    expect(rawOutputs).toEqual([{ answer: 'ok' }])
    expect(requests.every((request) => request.stream)).toBe(true)
  })

  it.each([
    ['plain text', () => ({ role: 'assistant', content: 'ok', refusal: null } as const)],
    ['wrong tool', () => toolReply('another_tool')],
    ['invalid JSON', (name: string) => toolReply(name, '{')],
    ['invalid schema', (name: string) => toolReply(name, '{"answer":1}')],
    ['valid and malformed calls', (name: string) => ({ ...toolReply(name),
      tool_calls: [...(toolReply(name).tool_calls ?? []), ...(toolReply(name, '{').tool_calls ?? [])] })],
    ['multiple calls', (name: string) => { const message = toolReply(name); return { ...message,
      tool_calls: [...(message.tool_calls ?? []), ...(message.tool_calls ?? [])] } }]
  ])('rejects %s instead of reporting a successful structured result', async (_label, reply) => {
    const { chat } = fixture(MODELS[0], reply)
    await expect(chat.withStructuredOutput(schema).invoke('Hello')).rejects.toThrow()
    const raw = await chat.withStructuredOutput(schema, { includeRaw: true }).invoke('Hello')
    expect(raw.parsed).toBeNull()
    expect(raw.raw).toBeDefined()
  })

  it('validates raw JSON schemas and named function definitions', async () => {
    const { chat, requests } = fixture(MODELS[1])
    interface Answer { answer: string }
    expect(await chat.withStructuredOutput<Answer>(jsonSchema).invoke('Hello')).toEqual({ answer: 'ok' })
    expect(await chat.withStructuredOutput({ name: 'answer_form', parameters: jsonSchema }).invoke('Hello'))
      .toEqual({ answer: 'ok' })
    expect(requests[1].tools?.[0]).toMatchObject({ function: { name: 'answer_form' } })
    const invalid = fixture(MODELS[1], (name) => toolReply(name, '{"answer":1}'))
    await expect(invalid.chat.withStructuredOutput(jsonSchema).invoke('Hello')).rejects.toThrow('schema')
  })

  it('validates complete streamed results and Zod refinements', async () => {
    const { chat } = fixture(MODELS[2], (name) => toolReply(name, '{"answer":1}'), true)
    await expect(async () => {
      const stream = await chat.withStructuredOutput(schema).stream('Hello')
      for await (const output of stream) void output
    }).rejects.toThrow('schema')
    const validJson = fixture(MODELS[0])
    await expect(validJson.chat.withStructuredOutput(z.object({ answer: z.string().refine((s) => s === 'different') }))
      .invoke('Hello')).rejects.toThrow()
  })

  it('does not swallow HTTP errors when includeRaw is enabled', async () => {
    const { chat, fetch } = fixture(MODELS[0])
    fetch.mockResolvedValue(Response.json({ error: { message: 'test unavailable' } }, { status: 503 }))
    await expect(chat.withStructuredOutput(schema, { includeRaw: true }).invoke('Hello')).rejects.toThrow('test unavailable')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves ordinary forced-tool rejection and other models behavior', async () => {
    const { chat, fetch } = fixture(MODELS[0])
    await expect(chat.bindTools([{ type: 'function', function: { name: 'answer_form', parameters: jsonSchema } }],
      { tool_choice: 'answer_form' }).invoke('Hello')).rejects.toThrow('only supports auto')
    expect(fetch).not.toHaveBeenCalled()
    expect(() => chat.withStructuredOutput(schema, { strict: true })).toThrow('strict tool calling')
    const standard = fixture('qwen3.8-flash')
    expect(await standard.chat.withStructuredOutput(schema, { method: 'functionCalling' }).invoke('Hello'))
      .toEqual({ answer: 'ok' })
    expect(standard.requests[0].tool_choice).toEqual({ type: 'function', function: { name: 'extract' } })
  })

  it('keeps messages immutable and isolates concurrent schemas', async () => {
    const { chat, requests } = fixture(MODELS[0])
    const messages = [new SystemMessage('original'), new HumanMessage('Hello')]
    await Promise.all(['first', 'second'].map((name) => chat.withStructuredOutput(schema, { name }).invoke(messages)))
    expect(messages).toHaveLength(2)
    expect(messages[0].content).toBe('original')
    expect(requests.map((r) => r.tools?.[0]).map((t) => t?.type === 'function' ? t.function.name : '').sort())
      .toEqual(['first', 'second'])
  })
})
