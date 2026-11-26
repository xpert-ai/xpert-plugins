import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { Gemini4ChatModel, gemini4History } from './gemini4.js'

it('round trips signed parallel function calls in the next Gemini request', async () => {
  const parts = [{ functionCall: { name: 'first', args: {} }, thoughtSignature: 'opaque' }, { functionCall: { name: 'second', args: {} } }]
  const event = { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 8 } }
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('data: ' + JSON.stringify(event) + '\n\n', {
    headers: { 'Content-Type': 'text/event-stream' }
  }))
  try {
    const chat = new Gemini4ChatModel({ model: 'gemini-4-carbon', apiKey: 'test' }, { thinking_level: 'High' })
    const human = new HumanMessage('Call both functions')
    const message = await chat.invoke([human])
    const next = gemini4History([human, message, ...message.tool_calls!.map(call => new ToolMessage({ content: 'ok', tool_call_id: call.id! }))])
    expect(next.contents[1].parts).toEqual(parts)
    expect(next.contents[2].parts.map(p => p.functionResponse?.name)).toEqual(['first', 'second'])
    expect(message.usage_metadata).toMatchObject({ input_tokens: 5, output_tokens: 3, total_tokens: 8 })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH')
  } finally { fetchMock.mockRestore() }
})

it.each([true, false])('pairs out-of-order parallel results with the right signed calls (provider IDs: %s)', async withIds => {
  const calls = ['Paris', 'Tokyo'].map((city, index) => ({
    functionCall: { ...(withIds ? { id: 'call-' + index } : {}), name: 'weather', args: { city } },
    ...(index === 0 ? { thoughtSignature: 'opaque-signature' } : {})
  }))
  const requests: { contents: { parts: unknown[] }[] }[] = []
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)))
    const parts = requests.length === 1 ? calls : [{ text: 'Done' }]
    const event = { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] }
    return new Response('data: ' + JSON.stringify(event) + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
  })
  try {
    const chat = new Gemini4ChatModel({ model: 'gemini-4-carbon', apiKey: 'test' }, {})
    const human = new HumanMessage('Compare the weather')
    const assistant = await chat.invoke([human])
    const results = assistant.tool_calls!.map(call => new ToolMessage({ tool_call_id: call.id!, content: call.args.city }))
    await chat.invoke([human, assistant, ...results.reverse()])
    expect(requests[1].contents[1].parts).toEqual(calls)
    expect(requests[1].contents[2].parts).toEqual(calls.map(({ functionCall }) => ({
      functionResponse: { ...(withIds ? { id: functionCall.id } : {}), name: 'weather', response: { result: functionCall.args.city } }
    })))
  } finally { fetchMock.mockRestore() }
})

it('translates inline media and retains a prior signed text turn', () => {
  const parts = [{ text: 'answer', thoughtSignature: 'signature' }]
  expect(gemini4History([
    new HumanMessage({ content: [{ type: 'image_url', image_url: 'data:image/png;base64,YQ==' }] }),
    new AIMessage({ content: 'answer', additional_kwargs: { gemini_parts: parts } })
  ]).contents).toEqual([
    { role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'YQ==' } }] },
    { role: 'model', parts }
  ])
})

it.each([
  ['data: {"promptFeedback":{"blockReason":"SAFETY"}}\n\n', 'Gemini blocked the prompt: SAFETY'],
  ['data: malformed\n\n', 'Error parsing JSON response']
])('surfaces provider failures from the stream', async (body, error) => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body))
  try {
    const chat = new Gemini4ChatModel({ model: 'gemini-4-carbon', apiKey: 'test' }, {})
    await expect(chat.invoke('Hi')).rejects.toThrow(error)
  } finally { fetchMock.mockRestore() }
})

it('sends host image URLs, inline documents and referenced audio in the provider request', async () => {
  const image = 'https://example.test/preview.png'
  const audio = 'https://example.test/clip.wav'
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('data: {"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}\n\n')
  )
  try {
    const chat = new Gemini4ChatModel({ model: 'gemini-4-neon', apiKey: 'test' }, {})
    await chat.invoke([new HumanMessage({ content: [
      { type: 'image_url', image_url: { url: image } },
      { type: 'file', source_type: 'base64', mime_type: 'application/pdf', data: 'cGRm' },
      { type: 'audio', source_type: 'url', mime_type: 'audio/wav', url: audio }
    ] })])
    const { contents } = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(contents[0].parts).toEqual([
      { fileData: { fileUri: image } },
      { inlineData: { mimeType: 'application/pdf', data: 'cGRm' } },
      { fileData: { mimeType: 'audio/wav', fileUri: audio } }
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  } finally { fetchMock.mockRestore() }
})
