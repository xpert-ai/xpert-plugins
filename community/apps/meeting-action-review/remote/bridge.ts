import { z } from 'zod/v3'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { WORKBENCH_NAVIGATION_OPEN_COMMAND, WORKBENCH_EXTENSION_VIEW_TARGET, WORKBENCH_ASSISTANT_EXECUTION_TARGET } from '@xpert-ai/contracts'
import type { ReadySession } from './dto'
export const querySchema = z.object({ selectionId: z.string().optional(), parameters: z.object({ mode: z.enum(['entry','list','new','detail']).optional() }).passthrough().optional() }).passthrough()
export type Query = z.infer<typeof querySchema>
const runtimeScopeSchema = z.object({ projectId: z.string().nullable(), conversationId: z.string().nullable(), groupId: z.string().nullable().optional() }).passthrough()
const initSchema = z.object({ instanceId: z.string(), scopeRevision: z.number().optional(), locale: z.string().optional(),
  runtimeScope: runtimeScopeSchema.optional(),
  manifest: z.object({ key: z.string() }).passthrough(), initialQuery: querySchema.optional(),
  theme: z.object({ mode: z.string().optional(), cssVars: z.record(z.string()).optional(), tokens: z.record(z.string()).optional() }).passthrough().optional()
}).passthrough()
export type Host = z.infer<typeof initSchema>
const channel = 'xpertai.remote_component'
let host: Host | null = null
let sequence = 0
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>; type: string; conversationId?: string }>()
let expectedConversation: string | undefined
export class ActionRejected extends Error {}
function post(type: string, fields: Record<string, unknown> = {}) {
  window.parent.postMessage({ channel, protocolVersion: 1, type, instanceId: host?.instanceId, scopeRevision: host?.scopeRevision, ...fields }, '*')
}
function rejectAll() { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('CONTEXT_CHANGED')) }; pending.clear() }
export function currentConversation() { return host?.runtimeScope?.conversationId }
function handoff(next: Host) {
  const matches = !!host && host.instanceId === next.instanceId && !!expectedConversation &&
    host.runtimeScope?.projectId === next.runtimeScope?.projectId && host.runtimeScope?.groupId === next.runtimeScope?.groupId &&
    next.runtimeScope?.conversationId === expectedConversation
  for (const [id, p] of pending) {
    clearTimeout(p.timer); pending.delete(id)
    if (matches && p.conversationId === expectedConversation) p.resolve({ success: true })
    else p.reject(new Error('CONTEXT_CHANGED'))
  }
  return matches
}
export function connect(onInit: (h: Host, preserveRecord: boolean) => void) {
  const handler = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const parsed = z.object({ channel: z.literal(channel), protocolVersion: z.literal(1), type: z.string(), instanceId: z.string().optional(),
      scopeRevision: z.number().optional(), requestId: z.string().optional(), data: z.unknown(), result: z.unknown(), code: z.string().optional(), event: z.unknown()
    }).passthrough().safeParse(event.data)
    if (!parsed.success) return
    const message = parsed.data
    if (message.type === 'init') {
      const init = initSchema.safeParse(event.data)
      if (!init.success) return
      if (host?.instanceId === init.data.instanceId && (init.data.scopeRevision ?? 0) < (host.scopeRevision ?? 0)) return
      const changed = !!host && (host.instanceId !== init.data.instanceId || host.scopeRevision !== init.data.scopeRevision)
      const preserve = changed ? handoff(init.data) : true
      host = init.data
      document.documentElement.classList.toggle('dark', host.theme?.mode === 'dark')
      for (const [key,value] of Object.entries(host.theme?.cssVars ?? {})) {
        if (key.startsWith('--xui-')) document.documentElement.style.setProperty(key, value)
      }
      installShadcnThemeVars(); onInit(host, preserve); post('resize', { height: window.innerHeight, viewportBound: true }); return
    }
    if (message.type === 'hostEvent' && host && message.instanceId === host.instanceId) {
      const scope = z.object({ type: z.literal('view.context.changed'), data: z.object({ revision: z.number(), runtimeScope: runtimeScopeSchema }) }).safeParse(message.event)
      if (scope.success && scope.data.data.revision > (host.scopeRevision ?? 0)) {
        const next = { ...host, scopeRevision: scope.data.data.revision, runtimeScope: scope.data.data.runtimeScope }
        const preserve = handoff(next); host = next; onInit(host, preserve)
      }
      return
    }
    if (!host || message.instanceId !== host.instanceId || !message.requestId) return
    if (message.scopeRevision !== host.scopeRevision && !(message.type === 'error' && message.scopeRevision === undefined)) return
    const item = pending.get(message.requestId)
    if (!item || (message.type !== item.type && message.type !== 'error')) return
    pending.delete(message.requestId); clearTimeout(item.timer)
    if (message.type === 'error') item.reject(new Error(message.code ?? 'TRANSPORT_ERROR'))
    else item.resolve(message.data ?? message.result)
  }
  window.addEventListener('message', handler); post('ready')
  return () => { window.removeEventListener('message', handler); rejectAll() }
}
function request(type: string, data: Record<string, unknown>, conversationId?: string) {
  if (!host) return Promise.reject(new Error('HOST_UNAVAILABLE'))
  const id = `mar-${++sequence}`
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('RESPONSE_UNKNOWN')) }, 30000)
    pending.set(id, { resolve, reject, timer, conversationId, type: type === 'requestData' ? 'data' : type === 'executeAction' ? 'actionResult' : 'clientCommandResult' })
    post(type, { requestId: id, ...data })
  })
}
export const read = (query: Query & { cursor?: string }) => request('requestData', { query })
const resultSchema = z.object({ success: z.boolean(), data: z.unknown() }).passthrough()
export async function act(actionKey: string, input: Record<string, unknown>) {
  const result = resultSchema.parse(await request('executeAction', { actionKey, input }))
  if (!result.success) {
    const error = z.object({ code: z.string() }).safeParse(result.data)
    throw new ActionRejected(error.success ? error.data.code : 'OPERATION_FAILED')
  }
  return result.data
}
export async function navigate(query: Query) {
  if (!host) throw new Error('HOST_UNAVAILABLE')
  const result = resultSchema.parse(await request('invokeClientCommand', {
    commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND, payload: { target: WORKBENCH_EXTENSION_VIEW_TARGET, viewKey: host.manifest.key, ...query }
  }))
  if (!result.success) throw new ActionRejected('NAVIGATION_FAILED')
}
export async function openAnalysis(session: ReadySession) {
  if (currentConversation() === session.conversationId) return
  expectedConversation = session.conversationId
  try {
    const result = resultSchema.parse(await request('invokeClientCommand', {
      commandKey: WORKBENCH_NAVIGATION_OPEN_COMMAND,
      payload: { target: WORKBENCH_ASSISTANT_EXECUTION_TARGET, conversationId: session.conversationId,
        executionId: session.executionId, threadId: session.threadId, preserveView: true }
    }, session.conversationId))
    if (!result.success) throw new ActionRejected('NAVIGATION_FAILED')
  } finally { expectedConversation = undefined }
}
