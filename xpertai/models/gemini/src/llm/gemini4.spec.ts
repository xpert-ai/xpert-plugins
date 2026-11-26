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
