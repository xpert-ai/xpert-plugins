import { BaseChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { z } from 'zod'
import { joinTongyiApiUrl } from '../types.js'

// No local URL fetch or filesystem access: accept a bounded data URI or provider-accessible HTTPS URL.
const audioSchema = z
  .array(
    z.union([
      z.object({ type: z.literal('input_audio'), input_audio: z.object({ data: z.string() }) }),
      z.object({ url: z.string() })
    ])
  )
  .length(1)
const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  seconds: z.number().nonnegative().optional(),
  prompt_tokens_details: z.object({ audio_tokens: z.number().nonnegative().optional() }).optional()
})
const responseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
  usage: usageSchema.optional()
})

export interface QwenAsrInput extends BaseChatModelParams {
  apiKey: string
  model: string
  baseUrl: string
}

export class QwenAsrChatModel extends BaseChatModel {
  constructor(private readonly fields: QwenAsrInput) {
    super(fields)
    if (!fields.apiKey) throw new Error('qwen_asr_credentials_missing')
  }

  _llmType() {
    return 'tongyi-qwen-asr'
  }

  async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const parsed = audioSchema.safeParse(messages.at(-1)?.content)
    if (!parsed.success) throw new Error('qwen_asr_audio_required')
    const block = parsed.data[0]
    const audio = 'url' in block ? block.url : 'input_audio' in block ? block.input_audio.data : undefined
    if (typeof audio !== 'string') throw new Error('qwen_asr_audio_required')
    if (audio.length > 10_000_000) throw new Error('qwen_asr_audio_too_large')
    // HTTPS URLs are forwarded to the provider; never dereferenced on the Xpert server.
    if (!isAudioDataUri(audio) && !isHttpsUrl(audio)) {
      throw new Error('qwen_asr_audio_format_invalid')
    }
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(120000)])
      : AbortSignal.timeout(120000)
    signal.throwIfAborted()
    const response = await fetch(joinTongyiApiUrl(this.fields.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.fields.apiKey}`, 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: this.fields.model,
        messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data: audio } }] }],
        stream: false,
        asr_options: { enable_itn: false }
      })
    })
    if (!response.ok) {
      // Provider error bodies may echo input audio, signed URLs or credentials.
      const error = z
        .object({ error: z.object({ code: z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/) }) })
        .safeParse(await response.json().catch(() => null))
      throw new Error(`qwen_asr_request_failed:${response.status}${error.success ? `:${error.data.error.code}` : ''}`)
    }
    const payload: unknown = await response.json().catch(() => null)
    signal.throwIfAborted()
    const result = responseSchema.safeParse(payload)
    if (!result.success) throw new Error('qwen_asr_response_invalid')
    const text = result.data.choices[0].message.content.trim()
    const usage = result.data.usage
    const message = new AIMessage({
      content: text,
      ...(usage
        ? {
            usage_metadata: {
              input_tokens: usage.prompt_tokens,
              output_tokens: usage.completion_tokens,
              total_tokens: usage.total_tokens,
              ...(usage.prompt_tokens_details?.audio_tokens !== undefined
                ? { input_token_details: { audio: usage.prompt_tokens_details.audio_tokens } }
                : {})
            },
            response_metadata: { usage }
          }
        : {})
    })
    return {
      generations: [{ text, message }],
      ...(usage
        ? {
            llmOutput: {
              tokenUsage: {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens
              },
              usage
            }
          }
        : {})
    }
  }
}

function isAudioDataUri(value: string): boolean {
  const match = /^data:audio\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value)
  if (!match) return false
  const encoded = match[1]
  return encoded.length % 4 === 0 && Buffer.from(encoded, 'base64').toString('base64') === encoded
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
