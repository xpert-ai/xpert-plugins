import {configureDebug,debug} from './debug'
import { installShadcnThemeVars } from '@xpert-ai/plugin-shadcn-ui/theme'
export type JsonRecord = Record<string, unknown>
const CHANNEL = 'xpertai.remote_component'
let instanceId: string | null = null,
  sequence = 0
const pending = new Map<
  string,
  { resolve: (value: JsonRecord) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> | undefined }
>()
const listeners = new Set<(type: string, payload: JsonRecord) => void>()
export const onHost = (fn: (type: string, payload: JsonRecord) => void) => {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
const record = (value: unknown): value is JsonRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
export function post(type: string, body: JsonRecord = {}) {
  parent.postMessage({ channel: CHANNEL, protocolVersion: 1, instanceId, type, ...body }, '*')
}
export function request(type: string, body: JsonRecord, timeoutMs = 135000): Promise<JsonRecord> {
  if (!instanceId) return Promise.reject(new Error('host_not_ready'))
  const requestId = String(++sequence)
  debug('request',{type,requestId})
  return new Promise((resolve, reject) => {
    const timer = timeoutMs > 0 ? setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('request_timeout'))
    }, timeoutMs) : undefined
    pending.set(requestId, { resolve, reject, timer })
    post(type, { requestId, ...body })
  })
}
export async function data<T>(kind: string, input: unknown = {}, page = 1, search = ''): Promise<T> {
  const response = await request('requestData', {
    query: { parameters: { kind, input: JSON.stringify(input) }, page, search },
  })
  const payload = response.payload ?? response.data ?? response.result
  return payload as T
}
export async function action<T>(actionKey: string, input: unknown): Promise<T> {
  const response = await request('executeAction', { actionKey, input })
  const value = response.payload ?? response.data ?? response.result
  if (!record(value) || value.success !== true) {
    const message = record(value) && record(value.message) ? value.message.zh_Hans : undefined
    throw new Error(typeof message === 'string' ? message : 'operation_failed')
  }
  return value.data as T
}
export const command = async (commandKey: string, payload: unknown, options?: { waitForUser: boolean }) => {
  const response = await request('invokeClientCommand', { commandKey, payload }, options?.waitForUser ? 0 : undefined)
  const result = response.result
  if (record(result) && result.success === false) throw new Error(String(result.message ?? 'client_command_failed'))
  return result
}
export async function upload<T>(input: unknown, file: File): Promise<T> {
  const buffer = await file.arrayBuffer()
  const response = await request('executeFileAction', {
    actionKey: 'import_file',
    input,
    file: { name: file.name, type: file.type, size: file.size, buffer },
  })
  const value = response.payload ?? response.data ?? response.result
  if (!record(value) || !value.success)
    throw new Error(record(value) && record(value.message) ? String(value.message.zh_Hans) : 'import_failed')
  return value.data as T
}
export function startBridge() {
  installShadcnThemeVars({ density: 'compact' })
  const receive = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (event.source !== parent || !record(message) || message.channel !== CHANNEL || message.protocolVersion !== 1)
      return
    if (message.type === 'init') {
      if (typeof message.instanceId !== 'string') return
      instanceId = message.instanceId
      configureDebug(message.debug);debug('init')
      applyTheme(message.theme)
      listeners.forEach((fn) => fn('init', message))
      return
    }
    if (message.instanceId !== instanceId) return
    if (['themeChanged', 'theme', 'updateTheme'].includes(String(message.type))) {
      applyTheme(message.theme ?? message.payload)
      listeners.forEach((fn) => fn('theme', message))
      return
    }
    if (['localeChanged', 'locale', 'languageChanged', 'language'].includes(String(message.type))) {
      listeners.forEach((fn) => fn('locale', message))
      return
    }
    if (message.type === 'hostEvent') {
      debug('host-event',{type:'hostEvent'})
      listeners.forEach((fn) => fn('event', message))
      return
    }
    if (typeof message.requestId === 'string') {
      const task = pending.get(message.requestId)
      if (!task) return
      debug('reply',{type:String(message.type),requestId:message.requestId})
      clearTimeout(task.timer)
      pending.delete(message.requestId)
      if (message.type === 'error')
        task.reject(new Error(typeof message.message === 'string' ? message.message : 'request_failed'))
      else task.resolve(message)
    }
  }
  window.addEventListener('message', receive)
  post('ready')
  return () => {
    window.removeEventListener('message', receive)
    for (const task of pending.values()) {
      clearTimeout(task.timer)
      task.reject(new Error('view_closed'))
    }
    pending.clear()
  }
}
function applyTheme(value: unknown) {
  const theme = record(value) ? value : {}
  const mode = theme.mode ?? theme.colorScheme
  document.documentElement.classList.toggle('dark', mode === 'dark')
  document.documentElement.dataset.theme = mode === 'dark' ? 'dark' : 'light'
  if (record(theme.cssVariables))
    for (const [key, value] of Object.entries(theme.cssVariables))
      if (key.startsWith('--xui-') && typeof value === 'string') document.documentElement.style.setProperty(key, value)
  const runtime = window as Window & { XpertRemoteUI?: { applyTheme: (theme: unknown) => void } }
  runtime.XpertRemoteUI?.applyTheme(value)
  installShadcnThemeVars({ density: 'compact' })
}
