// The iframe has an opaque origin. Only its bound parent can initialize or reply.
// All untyped postMessage payloads are validated at this protocol boundary.
import { z } from 'zod/v3'
import { t } from './i18n.js'
import type { Workbench, JsonValue, RuntimeStatus } from '../shared/contracts.js'
import { workbenchSchema } from '../shared/result-schema.js'

const CHANNEL = 'xpertai.remote_component'
const envelopeSchema = z.object({
  channel: z.literal(CHANNEL),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().nullable().optional(),
  requestId: z.union([z.string(), z.number()]).optional(),
  data: z.unknown().optional(),
  payload: z.unknown().optional(),
  result: z.unknown().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
  theme: z.unknown().optional(),
  debug: z.object({ enabled: z.boolean().optional() }).optional(),
  event: z.unknown().optional()
})
type Envelope = z.infer<typeof envelopeSchema>
type WireValue = JsonValue | ArrayBuffer | { [key: string]: WireValue | undefined }
type WireObject = { [key: string]: WireValue | undefined }
declare global {
  interface Window {
    XpertRemoteUI?: { applyTheme?: (theme: unknown) => void }
  }
}
const actionSchema = z.object({
  success: z.boolean(),
  message: z
    .union([z.string(), z.object({ zh_Hans: z.string().optional(), en_US: z.string().optional() })])
    .optional(),
  data: z.unknown().optional()
})
export const preparedSchema = z.object({
  queryId: z.string(),
  datasetId: z.string(),
  question: z.string(),
  prompt: z.string(),
  sessionId: z.string().nullable().optional(),
  baseQueryId: z.string().nullable().optional(),
  conversationId: z.string().nullable().optional(),
  threadId: z.string().nullable().optional()
})
export const validationSchema = z.object({
  errorCode: z.string().optional(),
  details: z
    .object({ issues: z.array(z.object({ row: z.number(), message: z.string() })).optional() })
    .nullable()
    .optional()
})

export class BridgeError extends Error {
  constructor(readonly code: 'timeout' | 'not_sent' | 'host_error' | 'invalid_response' | 'dispatch_rejected' | 'cancelled' | 'context_changed', message: string) {
    super(message)
    this.name = 'BridgeError'
  }
}

export class RemoteBridge {
  private instanceId: string | null = null
  private seq = 0
  private initialized = false
  private closed = false
  private debug = false
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void
      reject: (e: Error) => void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private waiters: Array<() => void> = []
  private readyTimer?: ReturnType<typeof setInterval>
  private listener = (event: MessageEvent) => {
    if (event.source !== parent) return
    const parsed = envelopeSchema.safeParse(event.data)
    if (!parsed.success) return
    const m = parsed.data
    if (m.type === 'init') {
      if (!m.instanceId || (this.instanceId && this.instanceId !== m.instanceId)) return
      this.instanceId = m.instanceId
      this.initialized = true
      this.debug = Boolean(m.debug?.enabled)
      window.XpertRemoteUI?.applyTheme?.(m.theme)
      clearInterval(this.readyTimer)
      this.waiters.splice(0).forEach((f) => f())
      return
    }
    if (m.instanceId !== this.instanceId) return
    if (m.type === 'theme') {
      window.XpertRemoteUI?.applyTheme?.(m.theme)
      return
    }
    if (m.type === 'hostEvent') {
      this.onRefresh?.()
      return
    }
    const requestId = String(m.requestId ?? '')
    const pending = this.pending.get(requestId)
    if (!pending) return
    this.pending.delete(requestId)
    clearTimeout(pending.timer)
    if (m.type === 'error') pending.reject(new BridgeError(m.code === 'context_changed' ? 'context_changed' : 'host_error', m.message ?? t('unknownError')))
    else pending.resolve(m.data ?? m.payload ?? m.result ?? m)
  }
  onRefresh?: () => void
  constructor() {
    window.addEventListener('message', this.listener)
    this.send('ready')
    this.readyTimer = setInterval(() => this.send('ready'), 500)
  }
  private send(type: string, body: WireObject = {}, transfer: Transferable[] = []) {
    parent.postMessage(
      { channel: CHANNEL, protocolVersion: 1, instanceId: this.instanceId, type, ...body },
      '*',
      transfer
    )
  }
  private async ready() {
    if (this.closed) throw new BridgeError('not_sent', t('bridgeError'))
    if (this.initialized) return
    await new Promise<void>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((f) => f !== done)
        reject(new BridgeError('not_sent', t('bridgeError')))
      }, 10000)
      this.waiters.push(done)
    })
  }
  async request(type: string, body: WireObject, transfer: Transferable[] = [], options: {signal?: AbortSignal; timeoutMs?: number} = {}): Promise<unknown> {
    await this.ready()
    if (this.closed) throw new BridgeError('not_sent', t('bridgeError'))
    if (options.signal?.aborted) throw new BridgeError('cancelled', t('restoreConversationFailed'))
    const requestId = String(++this.seq)
    if (this.debug) console.debug('[funds-query]', type, requestId)
    return new Promise((resolve, reject) => {
      const finish = (complete: () => void) => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        this.pending.delete(requestId)
        complete()
      }
      const fail = (error: Error) => finish(() => reject(error))
      const onAbort = () => fail(new BridgeError('cancelled', t('restoreConversationFailed')))
      const timer = setTimeout(() => {
        fail(new BridgeError('timeout', t('timeout')))
      }, options.timeoutMs ?? 40000)
      this.pending.set(requestId, { resolve: value => finish(() => resolve(value)), reject: fail, timer })
      options.signal?.addEventListener('abort', onAbort, {once: true})
      this.send(type, { ...body, requestId }, transfer)
    })
  }
  async data(
    parameters: { operation?: string; datasetId?: string; queryId?: string; sessionId?: string } = {},
    page = 1
  ): Promise<Workbench> {
    const data = await this.request('requestData', { query: { page, pageSize: 20, parameters } })
    const parsed = z.object({ meta: z.object({ workbench: workbenchSchema }) }).safeParse(data)
    if (!parsed.success) throw new BridgeError('invalid_response', t('invalidResponse'))
    return parsed.data.meta.workbench
  }
  async checkRuntime(): Promise<RuntimeStatus> {
    const raw = await this.request('requestData', {query: {parameters: {operation: 'runtime'}}})
    return z.object({meta: z.object({runtime: z.object({
      status: z.enum(['ready', 'unavailable']), pythonVersion: z.string().nullable(), message: z.string()
    })})}).parse(raw).meta.runtime
  }
  async action(actionKey: string, input: WireObject) {
    return actionSchema.parse(await this.request('executeAction', { actionKey, input }))
  }
  async upload(file: File) {
    const buffer = await file.arrayBuffer()
    return actionSchema.parse(
      await this.request(
        'executeFileAction',
        {
          actionKey: 'import',
          input: {},
          file: { name: file.name, type: file.type, size: file.size, buffer }
        },
        [buffer]
      )
    )
  }
  async getConversationContext() {
    const deadline = Date.now() + 5000
    while (!this.closed && Date.now() < deadline) {
      try {
        const raw = await this.request('invokeClientCommand', {
          commandKey: 'assistant.chat.get_context', payload: {}
        }, [], {timeoutMs: 1500})
        const parsed = z.object({success: z.literal(true), conversationId: z.string().nullable(), threadId: z.string().nullable(), ready: z.boolean()}).safeParse(raw)
        if (parsed.success) return parsed.data
        break
      } catch (error) {
        if (!(error instanceof BridgeError) || !['context_changed', 'timeout'].includes(error.code)) break
        await new Promise(resolve => setTimeout(resolve, 150))
      }
    }
    throw new BridgeError('not_sent', t('conversationContextUnavailable'))
  }

  async openConversation(conversationId: string, threadId: string) {
    const sameThread = (context: {conversationId: string | null; threadId: string | null}) =>
      context.conversationId === conversationId && context.threadId === threadId
    const current = await this.getConversationContext()
    if (sameThread(current) && current.ready) return
    const controller = new AbortController()
    let rejected = false
    const navigation = sameThread(current) ? Promise.resolve() : this.request('invokeClientCommand', {
      commandKey: 'workbench.navigation.open',
      payload: {target: 'assistant.conversation', conversationId, threadId, preserveView: true}
    }, [], {signal: controller.signal, timeoutMs: 20000})
      .then(raw => {
        const result = z.object({success: z.boolean(), code: z.string().optional()}).safeParse(raw)
        rejected = result.success && !result.data.success && result.data.code !== 'stale_context'
      }).catch(() => undefined)
    const deadline = Date.now() + 20000
    try {
      while (!this.closed && Date.now() < deadline) {
        try {
          const context = await this.getConversationContext()
          if (sameThread(context) && context.ready) return
        } catch { /* Retry during authorized navigation. */ }
        if (rejected) break
        await new Promise(resolve => setTimeout(resolve, 150))
      }
      throw new BridgeError('not_sent', t('restoreConversationFailed'))
    } finally {
      controller.abort()
      await navigation
    }
  }

  async ask(text: string, options: {newThread?: boolean; queryId?: string; conversationId?: string; threadId?: string} = {}) {
    const raw = await this.request('invokeClientCommand', {
      commandKey: 'assistant.chat.send_message',
      payload: { text, ...(options.newThread ? {newThread: true} : {}),
        ...(options.conversationId ? {conversationId: options.conversationId, threadId: options.threadId} : {}),
        ...(options.queryId ? {clientMessageId: `funds-query:${options.queryId}`} : {}) }
    })
    const r = z.object({ success: z.boolean().optional(), code: z.string().optional() }).safeParse(raw)
    if (!r.success || typeof r.data.success !== 'boolean')
      throw new BridgeError('invalid_response', t('invalidResponse'))
    if (!r.data.success) throw new BridgeError('dispatch_rejected', t(['stale_context','context_unavailable'].includes(r.data.code ?? '') ? 'restoreConversationFailed' : 'dispatchFailed'))
  }
  close() {
    this.closed = true
    clearInterval(this.readyTimer)
    this.waiters.splice(0).forEach(done => done())
    window.removeEventListener('message', this.listener)
    for (const p of this.pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(t('bridgeError')))
    }
    this.pending.clear()
  }
}

export function actionMessage(value: z.infer<typeof actionSchema>['message']) {
  return typeof value === 'string' ? value : (value?.zh_Hans ?? value?.en_US ?? t('unknownError'))
}
