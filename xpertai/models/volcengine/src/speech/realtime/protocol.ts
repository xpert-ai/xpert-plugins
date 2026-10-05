// Seeduplex 3.0 uses JSON frames. Do not mix this codec with the legacy binary API.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { RealtimeToolResult } from '@xpert-ai/contracts'
import type { RealtimeProtocol, RealtimeProtocolSink, RealtimeSessionOptions } from '@xpert-ai/plugin-sdk'

const details = z.object({ text_tokens: z.number().int().nonnegative().optional(), audio_tokens: z.number().int().nonnegative().optional() })
const usageSchema = z.object({ input_tokens_details: details.optional(), output_tokens_details: details.optional() })
const eventSchema = z.object({
  type: z.string(), response_id: z.string().max(256).optional(), item_id: z.string().max(256).optional(),
  text: z.string().max(64000).optional(), transcript: z.string().max(64000).optional(),
  delta: z.string().max(1024 * 1024).optional(), audio: z.string().max(1024 * 1024).optional(),
  usage: usageSchema.optional(), response: z.object({ id: z.string().max(256).optional(), usage: usageSchema.optional() }).optional(),
  items: z.array(z.object({ call_id: z.string().max(256), name: z.string(), arguments: z.string().max(32000) })).max(16).optional()
})

export class DoubaoRealtimeProtocol implements RealtimeProtocol {
  private ready = false
  private muted = false
  private outputId: string = randomUUID()
  private userId: string = randomUUID()
  private answer = ''
  private speaking = false
  private userSpeaking = false
  private outputOpen = false
  private canceled = new Set<string>()
  private completedCalls = new Set<string>()
  private suppressed = false
  private pending = new Set<string>()
  private results = new Map<string, string>()
  private usageIds = new Set<string>()

  constructor(private readonly options: RealtimeSessionOptions, private readonly sink: RealtimeProtocolSink) {}

  start() {
    this.sink.send({ type: 'session.create', session: { model: '1.2.6.1',
      audio: { input: { format: { type: 'pcm', rate: 16000 } },
        output: { format: { type: 'pcm_s16le', rate: 24000 }, voice: this.options.voice } },
      instructions: this.options.instructions } })
  }

  receive(raw: unknown) {
    const parsed = eventSchema.safeParse(raw)
    if (!parsed.success) { this.sink.emit({ type: 'error', code: 'invalid_provider_event' }); return }
    const event = parsed.data
    const responseId = event.response_id ?? event.response?.id
    // Preserve cancellation even if a delayed output.started follows the cancel.
    if (event.type.startsWith('response.output_') && responseId && this.canceled.has(responseId)) return
    switch (event.type) {
      case 'session.created':
        this.sink.send({ type: 'session.update', session: {
          tools: this.options.tools.map((tool) => ({ type: 'function', ...tool }))
        } })
        break
      case 'session.updated':
        if (!this.ready) { this.ready = true; this.sink.emit({ type: 'ready' }) }
        break
      case 'conversation.item.input_audio_transcription.started':
        this.userSpeaking = true
        this.userId = event.item_id ?? randomUUID()
        this.cancelResponse()
        this.sink.emit({ type: 'speech.started' })
        break
      case 'conversation.item.input_audio_transcription.delta':
      case 'conversation.item.input_audio_transcription.completed':
        if (event.type.endsWith('.completed')) this.userSpeaking = false
        this.sink.emit({ type: 'transcript', role: 'user', id: event.item_id ?? this.userId,
          text: event.text ?? event.transcript ?? event.delta ?? '', final: event.type.endsWith('.completed') })
        break
      case 'response.output_audio.started':
        this.beginOutput(responseId)
        this.speaking = true
        break
      case 'response.output_audio.delta': {
        const audio = event.audio ?? event.delta
        if (audio && !this.suppressed) this.sink.emit({ type: 'audio', responseId: this.outputId,
          audio: Buffer.from(audio, 'base64') })
        break
      }
      case 'response.output_audio.done':
        this.speaking = false
        this.sink.emit({ type: 'response.done', responseId: this.outputId })
        break
      case 'response.output_text.delta':
        if (!this.suppressed || (responseId && responseId !== this.outputId)) this.beginOutput(responseId)
        this.answer += event.text ?? event.delta ?? ''
        if (this.answer.length > 64000) { this.sink.emit({ type: 'error', code: 'transcript_limit' }); break }
        if (!this.suppressed) this.sink.emit({ type: 'transcript', role: 'assistant', id: this.outputId, text: this.answer, final: false })
        break
      case 'response.output_text.done':
        if (!this.suppressed) this.sink.emit({ type: 'transcript', role: 'assistant', id: this.outputId,
          text: event.text ?? this.answer, final: true })
        this.answer = ''
        break
      case 'response.function_call_arguments.done':
        if (event.items?.length) {
          const calls = event.items.filter((call) => !this.pending.has(call.call_id) && !this.completedCalls.has(call.call_id))
          if (this.pending.size + calls.length > 16) { this.sink.emit({ type: 'error', code: 'tool_limit' }); break }
          for (const call of calls) this.pending.add(call.call_id)
          if (calls.length) this.sink.emit({ type: 'tools', calls: calls.map((call) => ({
            id: call.call_id, name: call.name, arguments: call.arguments
          })) })
        }
        break
      case 'response.done': {
        this.outputOpen = false
        this.speaking = false
        this.sink.emit({ type: 'response.done', responseId: responseId ?? this.outputId })
        const usage = event.usage ?? event.response?.usage
        const usageId = responseId ?? this.outputId
        if (usage && !this.usageIds.has(usageId)) {
          this.usageIds.add(usageId)
          if (this.usageIds.size > 128) this.usageIds.delete(this.usageIds.values().next().value!)
          this.sink.emit({ type: 'usage', usage: { responseId: usageId,
            inputText: usage.input_tokens_details?.text_tokens, inputAudio: usage.input_tokens_details?.audio_tokens,
            outputText: usage.output_tokens_details?.text_tokens, outputAudio: usage.output_tokens_details?.audio_tokens } })
        }
        break
      }
      case 'error': this.sink.emit({ type: 'error', code: 'provider_error' }); break
      case 'session.closed': this.sink.emit({ type: 'closed' }); break
    }
  }
  private beginOutput(responseId?: string) {
    if (this.outputOpen && (!responseId || responseId === this.outputId)) return
    this.outputId = responseId ?? randomUUID()
    this.outputOpen = true
    this.suppressed = false
    this.answer = ''
    this.sink.emit({ type: 'response.started', responseId: this.outputId })
  }
  appendAudio(audio: Uint8Array) {
    if (this.ready && !this.muted) this.sink.send({ type: 'input_audio_buffer.append', audio: Buffer.from(audio).toString('base64') })
  }
  setMuted(muted: boolean) {
    if (this.muted === muted) return
    this.muted = muted
    this.sink.send({ type: muted ? 'input_audio_mute.commit' : 'input_audio_unmute.commit' })
  }
  cancelResponse() {
    if (this.outputOpen) {
      this.canceled.add(this.outputId)
      if (this.canceled.size > 64) this.canceled.delete(this.canceled.values().next().value!)
    }
    this.outputOpen = false
    this.suppressed = true
    this.answer = ''
    if (this.speaking) this.sink.send({ type: 'response.cancel' })
    this.speaking = false
  }
  submitToolResults(results: RealtimeToolResult[]) {
    for (const result of results) if (this.pending.has(result.id)) this.results.set(result.id, result.output)
    if (!this.pending.size || this.results.size !== this.pending.size) return
    this.sink.send({ type: 'conversation.item.create', items: [...this.results].map(([call_id, text]) => ({
      call_id, role: 'tool', content: [{ type: 'input_text', text }]
    })) })
    for (const id of this.pending) this.completedCalls.add(id)
    while (this.completedCalls.size > 128) this.completedCalls.delete(this.completedCalls.values().next().value!)
    this.pending.clear()
    this.results.clear()
  }
  notify(text: string) {
    if (!this.ready || this.userSpeaking || this.outputOpen || this.speaking || this.pending.size) return false
    this.speaking = true
    this.sink.send({ type: 'speech_text_buffer.replacement.append', text })
    this.sink.send({ type: 'speech_text_buffer.replacement.commit' })
    return true
  }
  close() { this.sink.send({ type: 'session.close' }) }
}
