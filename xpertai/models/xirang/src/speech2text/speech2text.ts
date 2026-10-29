import { setTimeout as delay } from 'node:timers/promises'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage, type BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { AiModelTypeEnum, FetchFrom, type AIModelEntity, type ICopilotModel } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { SpeechToTextModel, type TChatModelOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { XirangProviderStrategy } from '../provider.strategy.js'
import { getXirangAuthorization, getXirangBaseUrl } from '../types.js'
import protocols from './protocols.json' with { type: 'json' }

const protocolSchema = z.enum(['sync', 'async'])
const optionalText = z.string().trim().nullish().transform((value) => value || undefined)
const credentialsSchema = z.object({
  app_key: z.string().trim().min(1),
  endpoint_url: optionalText.pipe(z.string().url().optional()),
  endpoint_model_name: optionalText,
  asr_protocol: optionalText.pipe(protocolSchema.optional()),
  asr_format: optionalText.pipe(z.string().regex(/^[a-z0-9]{1,16}$/).default('wav'))
})
const knownProtocols = z.record(protocolSchema).parse(protocols)
const audioSchema = z.array(z.union([
  z.object({ url: z.string().min(1) }).transform((value) => value.url),
  z.object({ type: z.literal('input_audio'), input_audio: z.object({ data: z.string().min(1) }) }).transform((value) => value.input_audio.data)
])).length(1)
const taskSchema = z.object({ output: z.object({
  task_id: z.string().min(1),
  task_status: z.enum(['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'UNKNOWN']),
  results: z.array(z.object({ subtask_status: z.string(), transcription_url: z.string().url().optional() })).optional()
}) })
const transcriptSchema = z.object({ transcripts: z.array(z.object({
  text: z.string().optional(), sentences: z.array(z.object({ text: z.string() })).optional()
}).refine((value) => value.text !== undefined || value.sentences !== undefined)).min(1) })

function configuration(model: string, credentials: z.input<typeof credentialsSchema>) {
  const parsed = credentialsSchema.parse(credentials)
  const endpointModel = parsed.endpoint_model_name ?? model
  const protocol = parsed.asr_protocol ?? knownProtocols[model] ?? knownProtocols[endpointModel]
  if (!protocol) throw new Error('Select an ASR protocol for this custom model (sync or async)')
  return { ...parsed, app_key: parsed.app_key, asr_format: parsed.asr_format, model: endpointModel, protocol }
}

@Injectable()
export class XirangSpeechToTextModel extends SpeechToTextModel {
  constructor(override readonly modelProvider: XirangProviderStrategy) {
    super(modelProvider, AiModelTypeEnum.SPEECH2TEXT)
  }

  override async validateCredentials(model: string, credentials: z.input<typeof credentialsSchema>): Promise<void> {
    const config = configuration(model, credentials)
    // Check credentials without fabricating audio or submitting a billable transcription.
    await this.modelProvider.validateProviderCredentials(config)
  }

  override getCustomizableModelSchemaFromCredentials(
    model: string, credentials: { asr_protocol?: string; display_name?: string }
  ): AIModelEntity {
    protocolSchema.parse(credentials.asr_protocol || knownProtocols[model])
    return {
      model, model_type: AiModelTypeEnum.SPEECH2TEXT, fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
      label: { en_US: credentials.display_name || model, zh_Hans: credentials.display_name || model },
      model_properties: { file_upload_limit: 15, supported_file_extensions: 'wav,mp3,opus' },
      parameter_rules: []
    }
  }

  override getChatModel(copilotModel: ICopilotModel, options?: TChatModelOptions): BaseChatModel {
    const credentials = credentialsSchema.parse({
      ...copilotModel.copilot?.modelProvider?.credentials, ...options?.modelProperties
    })
    return new XirangAsrChatModel(configuration(copilotModel.model, credentials))
  }
}

export class XirangAsrChatModel extends BaseChatModel {
  constructor(private readonly config: ReturnType<typeof configuration>) { super({}) }
  _llmType() { return 'xirang-speech2text' }

  override async _generate(messages: BaseMessage[], options: this['ParsedCallOptions']): Promise<ChatResult> {
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(120_000)])
    signal.throwIfAborted()
    const [data] = audioSchema.parse(messages.at(-1)?.content)
    if (data.length > 20 * 1024 * 1024) throw new Error('ASR audio input exceeds 20 MiB')
    const isData = /^data:audio\/[\w.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(data)
    if (!isData) {
      const url = new URL(data)
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('ASR requires an HTTP(S) audio URL')
    }
    const baseUrl = getXirangBaseUrl(this.config)
    const headers = { Authorization: getXirangAuthorization(this.config), 'Content-Type': 'application/json' }
    let text: string
    if (this.config.protocol === 'sync') {
      const response = await fetch(`${baseUrl}/services/aigc/multimodal-generation/generation`, {
        method: 'POST', headers: { ...headers, 'X-DashScope-SSE': 'disable' }, signal,
        body: JSON.stringify({ model: this.config.model,
          input: { messages: [{ role: 'user', content: [{ type: 'input_audio', input_audio: { data } }] }] },
          parameters: { format: this.config.asr_format }
        })
      })
      if (!response.ok) throw new Error(`Xirang ASR failed (HTTP ${response.status})`)
      const result = z.object({ output: z.object({ text: z.string() }) }).parse(await response.json())
      text = result.output.text
    } else {
      if (isData) throw new Error('Asynchronous ASR requires a publicly accessible audio URL, not a Data URI')
      const response = await fetch(`${baseUrl}/services/audio/asr/transcription`, {
        method: 'POST', headers: { ...headers, 'X-DashScope-Async': 'enable' }, signal,
        body: JSON.stringify({ model: this.config.model, input: { file_urls: [data] } })
      })
      if (!response.ok) throw new Error(`Xirang ASR submission failed (HTTP ${response.status})`)
      let task = taskSchema.parse(await response.json()).output
      const taskId = task.task_id
      while (task.task_status === 'PENDING' || task.task_status === 'RUNNING') {
        await delay(1000, undefined, { signal })
        const poll = await fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, { headers, signal })
        if (!poll.ok) throw new Error(`Xirang ASR polling failed (HTTP ${poll.status})`)
        task = taskSchema.parse(await poll.json()).output
        if (task.task_id !== taskId) throw new Error('Xirang ASR returned a different task ID')
      }
      if (task.task_status !== 'SUCCEEDED') throw new Error(`Xirang ASR task ${task.task_status}`)
      const [result] = z.array(z.object({ subtask_status: z.literal('SUCCEEDED'), transcription_url: z.string().url() })).length(1).parse(task.results)
      const url = new URL(result.transcription_url)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid ASR result URL')
      // Result URLs are signed downloads: never forward the gateway AppKey or follow redirects.
      const download = await fetch(url, { signal, redirect: 'error' })
      if (!download.ok) throw new Error(`Xirang ASR result download failed (HTTP ${download.status})`)
      const transcript = transcriptSchema.parse(await download.json())
      text = transcript.transcripts.map((item) => item.text ?? item.sentences?.map((sentence) => sentence.text).join('') ?? '').join('\n')
    }
    return { generations: [{ text, message: new AIMessage(text) }] }
  }
}
