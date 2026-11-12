import { ASSISTANT_CHAT_SEND_MESSAGE_COMMAND, type XpertViewQuery } from '@xpert-ai/contracts'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { z } from 'zod'
import { draft, projection, type ActionKey } from './contracts'
import { i18n } from './i18n'
import { configureRemoteDebug, debugBridge } from './debug'

const channel = 'xpertai.remote_component'
const querySchema = z.object({
  selectionId: z.string().min(1).optional(),
  parameters: z.object({ draftId: z.string().min(1).optional() }).optional(),
})
const themeSchema = z.object({
  mode: z.enum(['light', 'dark']).optional(),
  density: z.enum(['default', 'compact']).optional(),
  tokens: z.record(z.union([z.string(), z.number()])).optional(),
})
const envelope = z.object({
  channel: z.literal(channel),
  protocolVersion: z.literal(1),
  type: z.string(),
  instanceId: z.string().min(1).optional(),
  scopeRevision: z.number().int().nonnegative().optional(),
  requestId: z.string().optional(),
  initialQuery: z.unknown(),
  locale: z.string().optional(),
  theme: themeSchema.optional(),
  debug: z.object({ enabled: z.boolean(), production: z.boolean().optional() }).optional(),
  event: z.object({
    type: z.string(),
    toolName: z.string().optional(),
    data: z.object({ revision: z.number().int().nonnegative().optional() }).optional(),
  }).optional(),
  result: z.unknown(),
  data: z.unknown(),
})
const resultSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), data: z.object({ draft, chatMessage: z.string().min(1).optional() }) }),
  z.object({ success: z.literal(false), data: z.object({ errorCode: z.string() }).optional(),
    failure: z.object({ kind: z.literal('business'), code: z.string() }).optional() }),
])
const refreshTools = new Set(['manufacturing_save_proposal', 'manufacturing_report_failure'])

type Request = {
  expectedType: 'data' | 'actionResult' | 'fileActionResult' | 'clientCommandResult'
  resolve: (value: object) => void
  reject: (reason: Error) => void
  timer: number
}

let scope: { instanceId: string; scopeRevision?: number } | null = null
let sequence = 0
const pending = new Map<string, Request>()

function cancelPending() {
  debugBridge('cancel', { pending: pending.size })
  for (const request of pending.values()) {
    window.clearTimeout(request.timer)
    request.reject(new DOMException('Scope changed', 'AbortError'))
  }
  pending.clear()
}

function post(type: string, body: object = {}, transfer: Transferable[] = []) {
  window.parent.postMessage({ channel, protocolVersion: 1, ...scope, type, ...body }, '*', transfer)
}

function installTheme(theme: z.infer<typeof themeSchema>, previous: string[]) {
  const root = document.documentElement
  root.classList.toggle('dark', theme.mode === 'dark')
  root.style.colorScheme = theme.mode ?? 'light'
  for (const property of previous) root.style.removeProperty(property)
  const tokens = Object.entries(theme.tokens ?? {}).flatMap(([key, value]) => {
    const property = key.startsWith('--xui-') ? key : `--xui-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
    if (!/^--xui-[a-z0-9-]+$/.test(property)) return []
    root.style.setProperty(property, String(value))
    return [property]
  })
  installShadcnThemeVars({ density: theme.density ?? 'default' })
  return tokens
}

export function startBridge(onQuery: (id?: string) => void, onRefresh: () => void) {
  let lastQuery: string | undefined
  let themeTokens: string[] = []
  const receive = (event: MessageEvent<object>) => {
    if (event.source !== window.parent || window.parent === window) return
    const parsed = envelope.safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      if (!message.instanceId || (scope && scope.instanceId !== message.instanceId)) return
      if ((message.scopeRevision ?? 0) < (scope?.scopeRevision ?? 0)) return
      const initial = scope === null
      const changedScope = !initial && message.scopeRevision !== scope?.scopeRevision
      if (changedScope) cancelPending()
      scope = { instanceId: message.instanceId, scopeRevision: message.scopeRevision }
      configureRemoteDebug(message.debug)
      debugBridge('init', { pending: pending.size })
      i18n.setLocale(message.locale)
      if (message.theme) themeTokens = installTheme(message.theme, themeTokens)
      const query = querySchema.safeParse(message.initialQuery).data
      const id = query?.parameters?.draftId ?? query?.selectionId
      if (initial || id !== lastQuery) {
        lastQuery = id
        onQuery(id)
      } else if (changedScope) onRefresh()
      post('resize', { viewportBound: true, height: window.innerHeight })
      return
    }
    if (!scope || message.instanceId !== scope.instanceId) return
    if (message.type === 'hostEvent' && message.event?.type === 'view.context.changed') {
      const revision = message.event.data?.revision
      if (revision !== undefined && revision > (scope.scopeRevision ?? -1)) {
        cancelPending()
        scope = { ...scope, scopeRevision: revision }
        // Quotation records are scoped to the Assistant and acting user.
        onRefresh()
      }
      return
    }
    if (message.scopeRevision !== undefined && message.scopeRevision !== scope.scopeRevision) return
    if (message.type === 'hostEvent' && message.event?.type === 'assistant.tool.completed' &&
      refreshTools.has(message.event.toolName ?? '')) onRefresh()
    if ((message.type === 'theme' || message.type === 'themeChanged') && message.theme) {
      themeTokens = installTheme(message.theme, themeTokens)
    }

    if (!message.requestId) return
    const request = pending.get(message.requestId)
    if (!request || (message.type !== 'error' && message.type !== request.expectedType)) return
    pending.delete(message.requestId)
    window.clearTimeout(request.timer)
    debugBridge('response', { kind: request.expectedType, pending: pending.size })
    if (message.type === 'error') request.reject(new Error('request_failed'))
    else request.resolve(message)
  }
  window.addEventListener('message', receive)
  post('ready')
  return () => {
    window.removeEventListener('message', receive)
    cancelPending()
    scope = null
    configureRemoteDebug()
  }
}

function request(
  type: 'requestData' | 'executeAction' | 'executeFileAction' | 'invokeClientCommand',
  expectedType: Request['expectedType'],
  body: object,
  timeout = 20_000,
  transfer: Transferable[] = [],
) {
  if (!scope) return Promise.reject(new Error('request_failed'))
  const requestId = `manufacturing-${++sequence}`
  return new Promise<object>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId)
      debugBridge('timeout', { kind: type, pending: pending.size })
      reject(new Error('request_timeout'))
    }, timeout)
    pending.set(requestId, { expectedType, resolve, reject, timer })
    debugBridge('request', { kind: type, pending: pending.size })
    post(type, { requestId, ...body }, transfer)
  })
}

export async function loadData(id?: string) {
  const query: XpertViewQuery = id ? { parameters: { draftId: id } } : {}
  const response = await request('requestData', 'data', { query })
  const parsed = z.object({ data: z.object({ summary: projection }) }).safeParse(response)
  if (!parsed.success) throw new Error('request_failed')
  return parsed.data.data.summary
}

function parseActionResult(response: object) {
  const parsed = z.object({ result: resultSchema }).safeParse(response)
  if (!parsed.success) throw new Error('request_failed')
  const result = parsed.data.result
  if (!result.success) throw new Error(result.data?.errorCode ?? result.failure?.code ?? 'request_failed')
  return result.data
}

export async function act(actionKey: Exclude<ActionKey, 'create_image'>, input: object, targetId?: string) {
  return parseActionResult(await request('executeAction', 'actionResult', { actionKey, input, targetId },
    actionKey === 'retry_ocr' ? 120_000 : 20_000))
}

export async function createImage(input: { title: string; requestId: string }, file: File) {
  const current = scope
  const buffer = await file.arrayBuffer()
  if (!current || current.instanceId !== scope?.instanceId || current.scopeRevision !== scope.scopeRevision) {
    throw new DOMException('Scope changed', 'AbortError')
  }
  return parseActionResult(await request('executeFileAction', 'fileActionResult', {
    actionKey: 'create_image',
    input,
    file: { name: file.name, type: file.type, size: file.size, buffer },
  }, 120_000, [buffer]))
}

export async function sendToAssistant(text: string) {
  const response = await request('invokeClientCommand', 'clientCommandResult', {
    commandKey: ASSISTANT_CHAT_SEND_MESSAGE_COMMAND,
    payload: { text, newThread: true },
  })
  if (!z.object({ result: z.object({ success: z.literal(true) }) }).safeParse(response).success) {
    throw new Error('dispatch_failed')
  }
}
