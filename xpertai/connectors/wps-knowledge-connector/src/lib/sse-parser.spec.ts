import { parseWpsSse } from './sse-parser.js'

describe('parseWpsSse', () => {
  it('parses events split across chunks and joins multi-line data', async () => {
    const stream = byteStream([
      ': heartbeat\n\nevent: message\nda',
      'ta: {"part":1}\ndata: second\n\n',
      'data: done\n\n'
    ])

    const events = []
    for await (const event of parseWpsSse(stream, options())) events.push(event)

    expect(events).toEqual([
      { event: 'message', data: '{"part":1}\nsecond' },
      { event: 'message', data: 'done' }
    ])
  })

  it('stops oversized provider streams', async () => {
    const stream = byteStream(['data: 1234567890\n\n'])
    const consume = async () => {
      for await (const event of parseWpsSse(stream, { ...options(), maxBytes: 5 })) void event
    }
    await expect(consume()).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' })
  })
})

function byteStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    }
  })
}

function options() {
  return { maxBytes: 4_096, totalTimeoutMs: 1_000, idleTimeoutMs: 500 }
}
