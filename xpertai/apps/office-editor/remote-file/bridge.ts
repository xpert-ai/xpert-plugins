import { t, i18n } from './i18n'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import { z } from 'zod/v3'
const channel = 'xpertai.remote_component'
const envelope = z.object({ channel: z.literal(channel), protocolVersion: z.literal(1), type: z.string(),
  instanceId: z.string().optional(), scopeRevision: z.number().optional(), requestId: z.string().optional(),
  data: z.unknown(), result: z.unknown(), message: z.string().optional(), code: z.string().optional(),
  event: z.object({ type: z.string(), data: z.object({ revision: z.number().optional() }).optional() }).optional(),
  locale: z.string().optional(), theme: z.object({ mode: z.enum(['light', 'dark']).optional(), tokens: z.record(z.string()).optional() }).optional() }).passthrough()
let host: { instanceId?: string; scopeRevision?: number } | null = null
let next = 0
const appearanceListeners = new Set<() => void>()
export function onAppearanceChange(listener: () => void) { appearanceListeners.add(listener); return () => { appearanceListeners.delete(listener) } }
type EditorEvent = { kind: 'prepareClose'; resourceId: string; requestId: string } | { kind: 'revealAnchor'; resourceId: string; blockId: string }
const editorListeners = new Set<(event: EditorEvent) => void>()
export const onEditorEvent = (listener: (event: EditorEvent) => void) => { editorListeners.add(listener); return () => { editorListeners.delete(listener) } }
export const closePrepared = (requestId: string, ready: boolean) => post('closePrepared', { requestId, ready })
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
function post(type: string, payload: object = {}) {
  window.parent.postMessage({ channel, protocolVersion: 1, ...host, type, ...payload }, '*')
}
/** Host-scoped transient feedback; it must not consume space in the document canvas. */
export const notify = (level: 'success' | 'error', message: string) => post('notify', { level, message })
export function connect(ready: (query: unknown) => void) {
  let lastQuery: string | undefined
  let initialized = false, attempts = 0, initialQuery: unknown
  let timer: ReturnType<typeof setTimeout> | undefined
  const readyAgain = () => { if (initialized) return; post('ready'); if (++attempts < 60) timer = setTimeout(readyAgain, 1000) }
  const receive = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return
    const checked = envelope.safeParse(event.data)
    if (!checked.success) return
    const message = checked.data
    if (message.type === 'init') {
      if (!message.instanceId) return
      initialized = true; clearTimeout(timer)
      // Language-only init messages update text without reloading data or collaborative editor state.
      i18n.setLocale(message.locale)
      const changed = !host || message.instanceId !== host.instanceId || message.scopeRevision !== host.scopeRevision
      if (changed) {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new DOMException(t('bridge.contextChanged'), 'AbortError')) }
        pending.clear()
        host = { instanceId: message.instanceId, scopeRevision: message.scopeRevision }
      }
      const tokens = message.theme?.tokens ?? {}
      document.documentElement.classList.toggle('dark', message.theme?.mode === 'dark')
      for (const [name, value] of Object.entries(tokens)) {
        const property = name.startsWith('--xui-') ? name : '--xui-' + name.replace(/[A-Z]/g, (part) => '-' + part.toLowerCase())
        document.documentElement.style.setProperty(property, value)
      }
      installShadcnThemeVars()
      const mapping: Record<string, string> = { colorBackground: '--background', colorForeground: '--foreground', colorBorder: '--border', colorMuted: '--muted', colorMutedForeground: '--muted-foreground', colorSecondary: '--secondary', colorPrimary: '--ring' }
      for (const [key, property] of Object.entries(mapping)) if (tokens[key]) document.documentElement.style.setProperty(property, tokens[key])
      document.documentElement.style.colorScheme = message.theme?.mode ?? 'light'
      appearanceListeners.forEach(listener => listener())
      initialQuery = message.initialQuery
      const query = JSON.stringify(message.initialQuery)
      if (changed || query !== lastQuery) { lastQuery = query; ready(message.initialQuery) }
      post('resize', { height: window.innerHeight, viewportBound: true }); return
    }
    if (host && message.instanceId === host.instanceId && message.type === 'hostEvent' && message.event?.type === 'view.context.changed') {
      const revision = message.event.data?.revision
      if (revision !== undefined && revision > (host.scopeRevision ?? -1)) {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new DOMException(t('bridge.contextChanged'), 'AbortError')) }
        pending.clear(); host = { ...host, scopeRevision: revision }; ready(initialQuery)
      }
      return
    }
    if (message.instanceId !== host?.instanceId || (message.scopeRevision !== host?.scopeRevision && message.type !== 'error')) return
    if (message.type === 'editorEvent') {
      const parsed = z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('prepareClose'), resourceId: z.string().uuid(), requestId: z.string().uuid() }),
        z.object({ kind: z.literal('revealAnchor'), resourceId: z.string().uuid(), blockId: z.string().uuid() })
      ]).safeParse(message)
      if (parsed.success) editorListeners.forEach((listener) => listener(parsed.data))
      return
    }
    if (!message.requestId) return
    const request = pending.get(message.requestId)
    if (!request) return
    clearTimeout(request.timer); pending.delete(message.requestId)
    if (message.type === 'error') request.reject(new Error(message.message ?? message.code ?? t('bridge.requestFailed')))
    else request.resolve(message.data ?? message.result)
  }
  window.addEventListener('message', receive); readyAgain()
  return () => {
    initialized = true; clearTimeout(timer)
    window.removeEventListener('message', receive)
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(i18n.error('bridge.closed')) }
    pending.clear(); host = null
  }
}
function request(type: string, payload: object): Promise<unknown> {
  if (!host) return Promise.reject(i18n.error('bridge.notConnected'))
  const requestId = `office-file-${++next}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(i18n.error('bridge.timeout')) }, 120000)
    pending.set(requestId, { resolve, reject, timer }); post(type, { requestId, ...payload })
  })
}
export const data = (query: object) => request('requestData', { query })
export async function action(actionKey: string, input: object) {
  const result = z.object({ success: z.boolean(), data: z.unknown(), message: z.string().optional() }).parse(
    await request('executeAction', { actionKey, input }))
  if (!result.success) throw new Error(result.message ?? t('common.actionFailed'))
  return result.data
}
export async function download(fileKey: string) {
  const file = z.object({ url: z.string(), fileName: z.string() }).parse(await request('requestFileAccess', { fileKey, purpose: 'download' }))
  const link = document.createElement('a')
  link.href = file.url; link.download = file.fileName; link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  return file
}

export async function command(commandKey: string, payload: object) {
  const value = await request('invokeClientCommand', { commandKey, payload })
  const result = z.object({ success: z.boolean(), message: z.string().optional(), code: z.string().optional() }).parse(value)
  if (!result.success) throw new Error(result.message ?? result.code ?? t('bridge.commandFailed'))
  return value
}
