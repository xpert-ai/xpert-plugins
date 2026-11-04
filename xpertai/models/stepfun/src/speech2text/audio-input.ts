import type { BaseMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { readPublicAudioUrl } from './audio-download.js'

const audioSchema = z.array(z.union([
  z.object({ type: z.literal('input_audio'), input_audio: z.object({ data: z.string(), format: z.enum(['wav', 'mp3', 'ogg', 'm4a']).optional() }) }),
  z.object({ url: z.string() })
])).length(1)
const mimeFormats = { 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a' } as const

/** Accept the host's uploaded-file URL or an explicit inline audio block. */
export async function readStepAudio(messages: BaseMessage[], signal?: AbortSignal) {
  const blocks = audioSchema.safeParse(messages.at(-1)?.content)
  if (!blocks.success) throw new Error('StepAudio requires one input_audio block or audio data URI')
  const block = blocks.data[0]
  let data = 'url' in block ? block.url : 'input_audio' in block ? block.input_audio.data : undefined
  if (typeof data !== 'string') throw new Error('StepAudio requires audio data')
  if ('url' in block && !data.startsWith('data:')) data = await readPublicAudioUrl(data, signal)
  const maxBytes = 25 * 1024 * 1024
  if (data.length > Math.ceil(maxBytes / 3) * 4 + 128) throw new Error('StepAudio exceeds 25 MiB')
  const uri = /^data:(audio\/[a-z0-9.+-]+);base64,(.*)$/.exec(data)
  const explicit = 'input_audio' in block ? block.input_audio.format : undefined
  const mimeFormat = uri && Object.entries(mimeFormats).find(([mime]) => mime === uri[1])?.[1]
  const format = mimeFormat || explicit
  if (!format || (explicit && mimeFormat && explicit !== mimeFormat)) throw new Error('StepAudio requires an explicit WAV, MP3, OGG or M4A format')
  const encoded = uri ? uri[2] : data
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error('StepAudio invalid base64 audio')
  const bytes = Buffer.from(encoded, 'base64')
  if (!bytes.length || bytes.length > maxBytes || bytes.toString('base64') !== encoded) throw new Error('StepAudio invalid audio size or encoding')
  return { data: encoded, format }
}
