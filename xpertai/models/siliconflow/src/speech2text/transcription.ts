import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { z } from 'zod'
import { readPublicAudioUrl } from './audio-download.js'

const formats = z.enum(['wav', 'mp3', 'ogg', 'm4a', 'flac', 'webm', 'mp4'])
const inputSchema = z.array(z.union([
  z.object({ type: z.literal('input_audio'), input_audio: z.object({ data: z.string(), format: formats.optional() }) }),
  z.object({ url: z.string() })
])).length(1)
const responseSchema = z.object({ text: z.string() })
const mimeTypes = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/x-m4a', flac: 'audio/flac', webm: 'audio/webm', mp4: 'audio/mp4' }

export class SiliconflowTranscriptionModel extends BaseChatModel {
  constructor(private readonly fields: BaseChatModelParams & { apiKey: string; baseUrl: string; model: string }) {
    super(fields)
    if (!fields.apiKey) throw new Error('SiliconFlow API key is required')
  }
  _llmType() { return 'siliconflow-speech2text' }
  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const parsed = inputSchema.safeParse(messages.at(-1)?.content)
    if (!parsed.success) throw new Error('SiliconFlow transcription requires one audio input')
    const block = parsed.data[0]
    let data = 'url' in block ? block.url : 'input_audio' in block ? block.input_audio.data : undefined
    if (typeof data !== 'string') throw new Error('SiliconFlow requires audio data')
    if ('url' in block && !data.startsWith('data:')) data = await readPublicAudioUrl(data, options.signal)
    const limit = 25 * 1024 * 1024
    if (data.length > Math.ceil(limit / 3) * 4 + 128) throw new Error('SiliconFlow audio exceeds 25 MiB')
    const uri = /^data:(audio\/[a-z0-9.+-]+);base64,(.*)$/.exec(data)
    const declared = 'input_audio' in block ? block.input_audio.format : undefined
    const mimeFormat = uri && Object.entries(mimeTypes).find(([, mime]) => mime === uri[1])?.[0]
    const format = formats.safeParse(mimeFormat || declared)
    if (!format.success || (declared && mimeFormat && declared !== mimeFormat)) throw new Error('SiliconFlow requires a supported audio data URI or an explicit input_audio format')
    const encoded = uri ? uri[2] : data
    if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('SiliconFlow invalid base64 audio')
    const bytes = Buffer.from(encoded, 'base64')
    if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== encoded) throw new Error('SiliconFlow invalid audio size or encoding')
    const body = new FormData()
    body.set('model', this.fields.model)
    body.set('file', new Blob([bytes], { type: mimeTypes[format.data] }), `audio.${format.data}`)
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000)
    signal.throwIfAborted()
    const response = await fetch(`${this.fields.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.fields.apiKey}` }, body, signal
    })
    if (!response.ok) throw new Error(`SiliconFlow transcription failed: HTTP ${response.status}`)
    const result = responseSchema.safeParse(await response.json())
    signal.throwIfAborted()
    if (!result.success) throw new Error('SiliconFlow transcription returned an invalid response')
    const text = result.data.text
    return { generations: [{ text, message: new AIMessage({ content: text }) }] }
  }
}
