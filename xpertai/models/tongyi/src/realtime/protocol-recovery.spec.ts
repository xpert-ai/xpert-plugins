import { QwenRealtimeProtocol } from './protocol'
import type { RealtimeModelEvent } from '@xpert-ai/contracts'

const protocols: QwenRealtimeProtocol[] = []
afterEach(() => { for (const protocol of protocols.splice(0)) protocol.close() })
function fixture() {
  const events: RealtimeModelEvent[] = []
  const send = jest.fn()
  const protocol = new QwenRealtimeProtocol({ voice: 'Tina', instructions: 'Talk', tools: [] }, { send, emit: event => events.push(event) })
  protocols.push(protocol)
  protocol.receive({ type: 'session.updated' })
  const tool = (responseId = 'status') => {
    protocol.receive({ type: 'response.created', response: { id: responseId } })
    protocol.receive({ type: 'response.done', response: { id: responseId, status: 'completed', output: [
      { type: 'function_call', status: 'completed', call_id: 'c1', name: 'get_task_status', arguments: '{}' }
    ] } })
    protocol.submitToolResults([{ id: 'c1', output: '{"status":"running"}' }])
  }
  const ack = () => protocol.receive({ type: 'conversation.item.created', item: {
    type: 'function_call_output', status: 'completed', call_id: 'c1'
  } })
  return { protocol, send, events, tool, ack }
}

describe('Qwen interrupted tool continuations', () => {
  it.each(['before', 'after'])('does not resume an old turn when the receipt arrives %s the next response', timing => {
    const { protocol, send, tool, ack } = fixture()
    tool()
    protocol.receive({ type: 'input_audio_buffer.speech_started' })
    if (timing === 'before') ack()
    protocol.receive({ type: 'input_audio_buffer.speech_stopped' })
    protocol.receive({ type: 'response.created', response: { id: 'next' } })
    protocol.receive({ type: 'response.done', response: { id: 'next' } })
    if (timing === 'after') ack()
    expect(send.mock.calls.map(([event]) => event.type)).toEqual(['conversation.item.create'])
  })

  it.each([true, false])('keeps audio and accepted tasks alive after a semantic rejection (correlated=%s)', correlated => {
    const { protocol, send, events, tool, ack } = fixture()
    tool()
    ack()
    protocol.receive({ type: 'error', error: { type: 'invalid_request_error',
      event_id: correlated ? send.mock.calls.at(-1)[0].event_id : undefined,
      message: 'Input speech was not accepted by semantic turn detection.' } })
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'semantic_turn_rejected', recoverable: true })
    expect(send).toHaveBeenCalledTimes(2)
    protocol.receive({ type: 'input_audio_buffer.speech_started' })
    protocol.receive({ type: 'input_audio_buffer.speech_stopped' })
    protocol.receive({ type: 'response.created', response: { id: 'next' } })
    protocol.receive({ type: 'response.audio.delta', response_id: 'next', delta: 'AAA=' })
    expect(events.at(-1)).toMatchObject({ type: 'audio', responseId: 'next' })
    expect(events.filter(event => event.type === 'tools')).toHaveLength(1)
    protocol.receive({ type: 'response.done', response: { id: 'next' } })
    expect(protocol.notify('Task completed')).toBe(true)
    expect(JSON.stringify(events)).not.toContain('Input speech')
  })

  it('does not let a late rejected turn clear a newer response reservation', () => {
    const { protocol, send, events, tool, ack } = fixture()
    tool()
    ack()
    protocol.receive({ type: 'error', error: { type: 'invalid_request_error', event_id: 'older-request',
      message: 'Input speech was not accepted by semantic turn detection.' } })
    expect(events.at(-1)).toMatchObject({ recoverable: true })
    expect(protocol.notify('Duplicate')).toBe(false)
    expect(send.mock.calls.filter(([event]) => event.type === 'response.create')).toHaveLength(1)
  })

  it('releases a rejected VAD candidate so later completion can be delivered', () => {
    const { protocol, events } = fixture()
    protocol.receive({ type: 'input_audio_buffer.speech_started' })
    protocol.receive({ type: 'input_audio_buffer.speech_stopped' })
    protocol.receive({ type: 'error', error: { type: 'invalid_request_error',
      message: 'Input speech was not accepted by semantic turn detection' } })
    expect(events.at(-1)).toMatchObject({ recoverable: true })
    expect(protocol.notify('Task completed')).toBe(true)
  })

  it('retires only an explicitly identified rejected receipt without repeating the task', () => {
    const { protocol, send, events, tool, ack } = fixture()
    tool()
    protocol.receive({ type: 'error', error: { type: 'invalid_request_error', event_id: send.mock.calls[0][0].event_id,
      message: 'Unknown function call id: c1' } })
    expect(events.at(-1)).toEqual({ type: 'error', code: 'tool_output_rejected', recoverable: true })
    protocol.submitToolResults([{ id: 'c1', output: 'duplicate' }])
    ack()
    expect(send).toHaveBeenCalledTimes(1)
    expect(protocol.notify('Task completed')).toBe(true)
  })

  it.each(['other-call', 'conflicting-event'])('does not guess which receipt failed (%s)', mismatch => {
    const { protocol, send, events, tool } = fixture()
    tool()
    protocol.receive({ type: 'error', error: { type: 'invalid_request_error',
      event_id: mismatch === 'conflicting-event' ? 'unrelated' : send.mock.calls[0][0].event_id,
      message: `Unknown function call id: ${mismatch === 'other-call' ? 'c2' : 'c1'}` } })
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'provider_error', recoverable: false })
  })

  it('does not replay a task or late acknowledgement after a receipt timeout', () => {
    jest.useFakeTimers()
    const { protocol, send, events, tool, ack } = fixture()
    try {
      tool()
      jest.advanceTimersByTime(10000)
      expect(events.at(-1)).toEqual({ type: 'error', code: 'tool_output_ack_timeout', recoverable: true })
      ack()
      expect(send).toHaveBeenCalledTimes(1)
      expect(events.filter(event => event.type === 'tools')).toHaveLength(1)
    } finally { protocol.close(); jest.useRealTimers() }
  })

  it.each([
    { type: 'invalid_request_error', message: 'private unknown failure' },
    { type: 'authentication_error', message: 'Input speech was not accepted by semantic turn detection.' },
    { type: 'invalid_request_error', code: 'rate_limit_exceeded', message: 'Input speech was not accepted by semantic turn detection.' }
  ])('keeps unrecognized, authentication and quota failures fatal: %j', error => {
    const { protocol, events } = fixture()
    protocol.receive({ type: 'error', error })
    expect(events.at(-1)).toMatchObject({ code: 'provider_error', recoverable: false })
    expect(JSON.stringify(events)).not.toContain(error.message)
  })
})
