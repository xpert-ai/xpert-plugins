import { DoubaoRealtimeProtocol } from './protocol'
import type { RealtimeModelEvent } from '@xpert-ai/contracts'
function fixture() {
  const events: RealtimeModelEvent[] = []
  const send = jest.fn()
  const protocol = new DoubaoRealtimeProtocol({ voice: 'zh_female_vv_uranus_bigtts', instructions: 'Talk', tools: [] }, { send, emit: (event) => events.push(event) })
  return { protocol, send, events }
}
describe('Doubao 3.0 realtime wire protocol', () => {
  it('uses JSON 3.0 with explicit signed-16 output and waits for session.updated', () => {
    const { protocol, send, events } = fixture()
    protocol.start()
    expect(send.mock.calls[0][0].session.audio.output.format).toEqual({ type: 'pcm_s16le', rate: 24000 })
    protocol.receive({ type: 'session.created' })
    expect(events).toHaveLength(0)
    protocol.receive({ type: 'session.updated' })
    expect(events).toEqual([{ type: 'ready' }])
  })
  it('submits every result from a batch together, without response.create', () => {
    const { protocol, send } = fixture()
    protocol.receive({ type: 'response.function_call_arguments.done', items: ['c1', 'c2'].map((call_id) => ({ call_id, name: 'delegate_task', arguments: '{}' })) })
    protocol.submitToolResults([{ id: 'c1', output: 'accepted' }])
    expect(send).not.toHaveBeenCalled()
    protocol.submitToolResults([{ id: 'c2', output: 'accepted' }])
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'conversation.item.create', items: [{ call_id: 'c1', role: 'tool' }, { call_id: 'c2', role: 'tool' }] })
  })
  it('mutes explicitly and suppresses interrupted audio', () => {
    const { protocol, send, events } = fixture()
    protocol.receive({ type: 'session.updated' })
    protocol.setMuted(true)
    protocol.appendAudio(new Uint8Array(640))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'input_audio_mute.commit' })
    protocol.receive({ type: 'response.output_audio.started', response_id: 'r' })
    protocol.receive({ type: 'conversation.item.input_audio_transcription.started' })
    protocol.receive({ type: 'response.output_audio.delta', audio: 'AAA=' })
    expect(events.some((event) => event.type === 'audio')).toBe(false)
    protocol.setMuted(false)
    expect(send).toHaveBeenLastCalledWith({ type: 'input_audio_unmute.commit' })
  })
  it('keeps late canceled responses silent and waits for the user before notifications', () => {
    const { protocol, events } = fixture()
    protocol.receive({ type: 'session.updated' })
    protocol.receive({ type: 'response.output_audio.started', response_id: 'old' })
    protocol.receive({ type: 'conversation.item.input_audio_transcription.started' })
    protocol.receive({ type: 'response.output_audio.started', response_id: 'old' })
    protocol.receive({ type: 'response.output_audio.delta', response_id: 'old', audio: 'AAA=' })
    expect(events.filter((event) => event.type === 'audio')).toHaveLength(0)
    expect(protocol.notify('Task completed')).toBe(false)
    protocol.receive({ type: 'conversation.item.input_audio_transcription.completed', text: 'hello' })
    expect(protocol.notify('Task completed')).toBe(true)
    expect(protocol.notify('Second task')).toBe(false)
  })
  it('correlates text that precedes audio and does not repeat acknowledged tool calls', () => {
    const { protocol, events } = fixture()
    protocol.receive({ type: 'response.output_text.delta', response_id: 'new', text: 'Hello' })
    protocol.receive({ type: 'response.output_audio.started', response_id: 'new' })
    protocol.receive({ type: 'response.output_text.done', text: 'Hello' })
    expect(events.filter((event) => event.type === 'response.started')).toEqual([{ type: 'response.started', responseId: 'new' }])
    expect(events.filter((event) => event.type === 'transcript').every((event) => event.id === 'new')).toBe(true)
    const call = { type: 'response.function_call_arguments.done', items: [{ call_id: 'c', name: 'delegate_task', arguments: '{}' }] }
    protocol.receive(call)
    protocol.submitToolResults([{ id: 'c', output: 'accepted' }])
    protocol.receive(call)
    expect(events.filter((event) => event.type === 'tools')).toHaveLength(1)
  })
})
