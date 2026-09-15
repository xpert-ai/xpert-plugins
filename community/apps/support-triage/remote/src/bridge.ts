import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
import type { AbortAnalysisInput, AnalyzeReceipt, ConfirmTicketInput, CreateTicketInput, MutationReceipt, TicketDetail, TicketList, TicketRevisionInput, TicketStatus } from '../../src/domain/contracts'

export interface ViewQuery { page?: number; pageSize?: number; search?: string; selectionId?: string; parameters?: { status?: TicketStatus; ticketId?: string } }
interface Theme { mode?: 'light' | 'dark'; density?: 'default' | 'compact'; tokens?: Record<string, string> }
export interface HostInit { locale?: string; theme?: Theme; initialQuery?: ViewQuery; debug?: { enabled: boolean } }
type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type ActionResult = { success: true; data?: MutationReceipt | AnalyzeReceipt } | { success: false; code?: string; data?: { code?: string } }
interface Response { data?: TicketList | { item: TicketDetail }; result?: ActionResult; message?: string }
interface HostMessage extends HostInit, Response { channel: string; protocolVersion: number; instanceId?: string; type: string; requestId?: string; event?: Json; payload?: Json }
type Body = { query?: ViewQuery; actionKey?: string; targetId?: string; input?: CreateTicketInput | TicketRevisionInput | ConfirmTicketInput | AbortAnalysisInput; commandKey?: AnalyzeReceipt['commandKey']; payload?: AnalyzeReceipt['payload'] }
const CHANNEL = 'xpertai.remote_component'
let instanceId: string | undefined
let enabled = false
let sequence = 0
const pending = new Map<string, { resolve: (value: Response) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
export function debug(event: string, data: { operation?: string; requestId?: string; applied?: boolean; dirty?: boolean; targeted?: boolean } = {}) {
  if (enabled) console.debug('[support-triage]', event, data)
}
export function applyTheme(theme: Theme = {}) {
  document.documentElement.classList.toggle('dark', theme.mode === 'dark')
  for (const [key, value] of Object.entries(theme.tokens ?? {})) {
    const cssKey = key.startsWith('--xui-') ? key : '--xui-' + key.replace(/[A-Z]/g, x => '-' + x.toLowerCase())
    document.documentElement.style.setProperty(cssKey, value)
  }
  installShadcnThemeVars({ density: theme.density ?? 'default' })
}
/** The protocol uses JSON payloads. Normalize common ChatKit wrappers in one place. */
export function normalizeHostEvent(value: Json | undefined): { ticketId?: string; toolName?: string } {
  const result: { ticketId?: string; toolName?: string } = {}
  function visit(item: Json | undefined, depth: number) {
    if (depth > 7 || item == null) return
    if (typeof item === 'string') {
      if (item.length > 16000) return
      try { visit(JSON.parse(item) as Json, depth + 1) } catch {
        result.ticketId ??= item.match(/"ticketId"\s*:\s*"([\w-]+)"/)?.[1]
      }
    } else if (Array.isArray(item)) item.slice(0, 20).forEach(child => visit(child, depth + 1))
    else if (typeof item === 'object') {
      if (typeof item.ticketId === 'string') result.ticketId ??= item.ticketId
      if (typeof item.toolName === 'string') result.toolName ??= item.toolName
      if (typeof item.name === 'string') result.toolName ??= item.name
      for (const key of ['event', 'payload', 'data', 'result', 'output', 'input', 'args', 'target', 'item', 'toolCall', 'tool_call', 'function', 'content', 'argsPreview']) visit(item[key], depth + 1)
    }
  }
  visit(value, 0)
  return result
}
export function startBridge(onInit: (init: HostInit) => void, onChange: (event: ReturnType<typeof normalizeHostEvent>) => void) {
  const listener = (event: MessageEvent<HostMessage>) => {
    const message = event.data
    if (event.source !== window.parent || !message || message.channel !== CHANNEL || message.protocolVersion !== 1) return
    if (message.type === 'init' && message.instanceId) {
      instanceId = message.instanceId
      enabled = message.debug?.enabled === true
      applyTheme(message.theme)
      debug('init')
      onInit(message)
      window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type: 'resize', height: 800, viewportBound: true }, '*')
      return
    }
    if (!instanceId || message.instanceId !== instanceId) return
    if (message.type === 'theme' || message.type === 'themeChanged') { applyTheme(message.theme); return }
    if (message.type === 'hostEvent') {
      debug('host-event.received')
      const normalized = normalizeHostEvent(message.event ?? message.payload ?? JSON.stringify(message))
      debug('host-event.normalized', { targeted: Boolean(normalized.ticketId) })
      onChange(normalized)
      return
    }
    const request = message.requestId ? pending.get(message.requestId) : undefined
    if (request && message.requestId) {
      pending.delete(message.requestId)
      clearTimeout(request.timer)
      debug('response.received', { requestId: message.requestId })
      message.type === 'error' ? request.reject(new Error(message.message ?? 'request_failed')) : request.resolve(message)
    }
  }
  window.addEventListener('message', listener)
  window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, type: 'ready' }, '*')
  return () => {
    window.removeEventListener('message', listener)
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('view_disposed')) }
    pending.clear()
  }
}
function request(type: string, body: Body): Promise<Response> {
  if (!instanceId) return Promise.reject(new Error('not_initialized'))
  const requestId = `triage-${++sequence}`
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('request_timeout')) }, 30000)
    pending.set(requestId, { resolve, reject, timer })
    debug('request.started', { requestId, operation: type })
    window.parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type, requestId, ...body }, '*')
  })
}
export async function listTickets(query: ViewQuery): Promise<TicketList> {
  const { data } = await request('requestData', { query })
  if (!data || !('items' in data) || !Array.isArray(data.items)) throw new Error('invalid_response')
  return data
}
export async function readTicket(ticketId: string): Promise<TicketDetail> {
  const { data } = await request('requestData', { query: { parameters: { ticketId } } })
  if (!data || !('item' in data) || data.item.id !== ticketId) throw new Error('invalid_response')
  return data.item
}
export async function mutate(actionKey: 'create_ticket' | 'analyze_ticket' | 'confirm_ticket' | 'abort_analysis', input: Body['input']) {
  const { result } = await request('executeAction', { actionKey, input, targetId: input && 'ticketId' in input ? input.ticketId : undefined })
  if (!result) throw new Error('action_failed')
  if (!result.success) throw new Error(result.data?.code ?? result.code ?? 'action_failed')
  if (!result.data) throw new Error('invalid_response')
  return result.data
}
export async function analyzeTicket(input: TicketRevisionInput) {
  const receipt = await mutate('analyze_ticket', input)
  if (!('commandKey' in receipt)) throw new Error('invalid_response')
  try {
    const response = await request('invokeClientCommand', { commandKey: receipt.commandKey, payload: receipt.payload })
    if (response.result?.success !== true) throw new Error('assistant_unavailable')
  } catch {
    try { await mutate('abort_analysis', { ticketId: receipt.ticketId, expectedRevision: receipt.revision, attemptId: receipt.attemptId, reason: 'dispatcher_unavailable' }) }
    catch { /* A competing completion may have won; the caller reloads persisted state. */ }
    throw new Error('assistant_unavailable')
  }
  return receipt
}
